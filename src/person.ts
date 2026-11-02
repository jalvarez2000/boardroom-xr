import {
  Bone,
  CanvasTexture,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  DoubleSide,
} from 'three';
import { loadFbx } from './avatar.js';
import { createCoffeeCup, createWaterGlass } from './props.js';
import {
  box,
  canvasTexture,
  cyl,
  ik2,
  MaterialBag,
  rng,
  shadows,
  smoothstep,
} from './util.js';

export type Activity = 'notes' | 'listening' | 'laptop';

export interface PersonSpec {
  name: string;
  female?: boolean;
  /** folder under public/models and the texture prefix used inside it */
  model: string;
  tex: string;
  activity: Activity;
  seed: number;
}

const TABLE_Y = 0.75;
const PELVIS_Y = 0.59;
const UP = new Vector3(0, 1, 0);

function labelTexture(text: string, speaking: boolean): CanvasTexture {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const r = 56;
    ctx.beginPath();
    ctx.moveTo(r, 8);
    ctx.arcTo(w - 8, 8, w - 8, h - 8, r);
    ctx.arcTo(w - 8, h - 8, 8, h - 8, r);
    ctx.arcTo(8, h - 8, 8, 8, r);
    ctx.arcTo(8, 8, w - 8, 8, r);
    ctx.closePath();
    ctx.fillStyle = speaking ? 'rgba(37,99,235,0.92)' : 'rgba(18,22,30,0.82)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    let size = 58;
    ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    while (size > 26 && ctx.measureText(text).width > w - 56) {
      size -= 2;
      ctx.font = `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

// ---- bone helpers (all world-space, so the skeleton's local axes do not matter)
const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();
const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const vd = new Vector3();

/** Rotate `bone` so the segment bone→child points along the world direction `dir`. */
function aim(bone: Object3D, child: Object3D, dir: Vector3): void {
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  bone.getWorldPosition(va);
  child.getWorldPosition(vb);
  vb.sub(va).normalize();
  qa.setFromUnitVectors(vb, dir);
  bone.getWorldQuaternion(qb);
  (bone.parent as Object3D).getWorldQuaternion(qc).invert();
  bone.quaternion.copy(qc.multiply(qa).multiply(qb));
  bone.updateMatrixWorld(true);
}

/** Apply a world-space rotation (axis, angle) to a bone on top of its current pose. */
function spin(bone: Object3D, axis: Vector3, angle: number): void {
  bone.updateWorldMatrix(true, false);
  qa.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(qb);
  (bone.parent as Object3D).getWorldQuaternion(qc).invert();
  bone.quaternion.copy(qc.multiply(qa).multiply(qb));
  bone.updateMatrixWorld(true);
}

interface ArmRig {
  clavicle: Bone;
  upper: Bone;
  fore: Bone;
  hand: Bone;
  fingers: Bone[][]; // [index..pinky][joint]
  thumb: Bone;
  l1: number;
  l2: number;
}

/** Seated, bone-driven person built from a Rocketbox avatar plus its table props. */
export class Person {
  readonly root = new Group();
  readonly bag = new MaterialBag();
  readonly spec: PersonSpec;
  readonly ready: Promise<void>;

  private av = new Group();
  private skinned: SkinnedMesh | null = null;
  private morph: Record<string, number> = {};
  private bones: Record<string, Bone> = {};
  private baseQ: Record<string, Quaternion> = {};
  private arms: ArmRig[] = [];
  private pen: Mesh | null = null;
  private label!: Mesh;
  private labelMat: MeshBasicMaterial;
  private labelTex: { idle: CanvasTexture; talk: CanvasTexture };
  private props = new Group();
  private loaded = false;

  // behaviour state
  private rand: () => number;
  private yaw = 0;
  private pitch = 0;
  private nextBlink: number;
  private blinkT = -1;
  private glanceDown = 0;
  private nextGlance: number;
  private talkGain = 0;
  private gesture = 0;
  private speaking = false;
  private thinking = false;
  private phase: number;
  private look = new Vector3();
  private visemeT = 0;
  private visemeA = 0;
  private visemeB = 0;
  private visemeMix = 0;

  // scratch
  private S = new Vector3();
  private E = new Vector3();
  private W = new Vector3();
  private H = new Vector3();
  private F = new Vector3();
  private pole = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private rootQ = new Quaternion();
  private q0 = new Quaternion();
  private qF = new Quaternion();
  private qD = new Quaternion();
  private qT = new Quaternion();
  private avYaw = 0;
  private swivel = 0;
  private armBase = new Map<Bone, Quaternion>();
  private headFwdLocal = new Vector3();
  debug = { yaw: 0, pitch: 0, err: 0 };
  private dirA = new Vector3();
  private dirB = new Vector3();

  constructor(spec: PersonSpec) {
    this.spec = spec;
    this.rand = rng(spec.seed);
    this.phase = this.rand() * 10;
    this.nextBlink = 1 + this.rand() * 3;
    this.nextGlance = 2 + this.rand() * 4;
    this.buildProps();

    this.labelMat = new MeshBasicMaterial({ transparent: true, depthWrite: false });
    this.labelTex = {
      idle: labelTexture(spec.name, false),
      talk: labelTexture(spec.name, true),
    };
    this.labelMat.map = this.labelTex.idle;
    // la etiqueta NO va en `bag`: setFade() apaga `transparent` al sentarse y el fondo transparente salía blanco
    this.label = new Mesh(new PlaneGeometry(0.36, 0.09), this.labelMat);
    this.label.position.set(0, 1.62, 0.02);
    this.label.renderOrder = 20;
    this.root.add(this.label);
    this.props.position.z = -0.1;
    this.root.add(this.av, this.props);
    this.root.name = `person-${spec.name}`;
    this.ready = this.loadAvatar();
  }

  // ---------------------------------------------------------------- avatar

  private async loadAvatar(): Promise<void> {
    const dir = `./models/${this.spec.model}`;
    const src = await loadFbx(`${dir}/avatar.fbx`);
    src.scale.setScalar(0.01);
    this.av.add(src);

    const texLoader = new TextureLoader();
    const tex = (file: string, srgb: boolean): Texture => {
      const t = texLoader.load(`${dir}/${this.spec.tex}_${file}`);
      t.colorSpace = srgb ? SRGBColorSpace : '';
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = 8;
      return t;
    };

    src.traverse((o) => {
      const b = o as Bone;
      if (b.isBone) {
        this.bones[b.name.replace('Bip01_', '')] = b;
      }
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) {
        this.skinned = m;
        m.frustumCulled = false;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const next = mats.map((old: Material) => this.makeMaterial(old.name, tex));
        m.material = Array.isArray(m.material) ? next : next[0];
        for (const [name, idx] of Object.entries(m.morphTargetDictionary ?? {})) {
          this.morph[name.replace('blendShape1.', '')] = idx;
        }
      }
    });
    if (!this.skinned) return;

    // Face +Z regardless of how the FBX was exported.
    this.av.updateMatrixWorld(true);
    const head = this.bones.Head;
    const reye = this.bones.REye;
    const leye = this.bones.LEye;
    // measure in the person's own frame: the seat rotation is already applied to root
    this.root.updateWorldMatrix(true, true);
    head.getWorldPosition(va);
    this.root.worldToLocal(va);
    reye.getWorldPosition(vb);
    this.root.worldToLocal(vb);
    leye.getWorldPosition(vc);
    this.root.worldToLocal(vc);
    vb.add(vc).multiplyScalar(0.5).sub(va);
    this.avYaw = -Math.atan2(vb.x, vb.z);
    this.av.rotation.y = this.avYaw;

    // Sit: pelvis at seat height, legs bent.
    this.av.updateMatrixWorld(true);
    this.bones.Pelvis.getWorldPosition(va);
    this.root.worldToLocal(va);
    this.av.position.set(-va.x, PELVIS_Y - va.y, 0.03 - va.z);
    this.root.updateWorldMatrix(true, true);
    this.poseLegs();

    for (const n of ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) {
      this.baseQ[n] = this.bones[n].quaternion.clone();
    }
    this.root.updateWorldMatrix(true, true);
    this.bones.Head.getWorldQuaternion(qa).invert();
    this.headFwdLocal.set(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(qb)).applyQuaternion(qa);
    for (const side of ['L', 'R']) {
      const fingers: Bone[][] = [];
      for (let i = 1; i <= 4; i++) {
        fingers.push([
          this.bones[`${side}_Finger${i}`],
          this.bones[`${side}_Finger${i}1`],
          this.bones[`${side}_Finger${i}2`],
        ]);
      }
      const upper = this.bones[`${side}_UpperArm`];
      const fore = this.bones[`${side}_Forearm`];
      const hand = this.bones[`${side}_Hand`];
      upper.getWorldPosition(va);
      fore.getWorldPosition(vb);
      hand.getWorldPosition(vc);
      this.arms.push({
        clavicle: this.bones[`${side}_Clavicle`],
        upper,
        fore,
        hand,
        fingers,
        thumb: this.bones[`${side}_Finger0`],
        l1: va.distanceTo(vb),
        l2: vb.distanceTo(vc),
      });
      const a = this.arms[this.arms.length - 1];
      for (const b of [a.upper, a.fore, a.hand, a.thumb, ...a.fingers.flat()]) {
        this.armBase.set(b, b.quaternion.clone());
      }
    }
    shadows(this.av, true, true);
    if (this.spec.activity === 'notes') {
      const penM = this.bag.make(0x1a1d4a, { rough: 0.3, metal: 0.3 });
      this.pen = cyl(penM, 0.0045, 0.14, 0, TABLE_Y, 0.5, this.root);
      this.pen.castShadow = true;
    }
    this.loaded = true;
  }

  private makeMaterial(name: string, tex: (f: string, srgb: boolean) => Texture): Material {
    const n = name.toLowerCase();
    if (n.includes('opacity')) {
      const m = new MeshStandardMaterial({
        map: tex('opacity_color.png', true),
        alphaTest: 0.45,
        side: DoubleSide,
        roughness: 0.75,
      });
      this.bag.track(m, 1);
      return m;
    }
    if (n.includes('glasses')) {
      const m = new MeshStandardMaterial({
        map: tex('glasses_opacity_color.png', true),
        alphaTest: 0.2,
        side: DoubleSide,
        roughness: 0.2,
      });
      this.bag.track(m, 1);
      return m;
    }
    const part = n.includes('head') ? 'head' : 'body';
    const m = new MeshStandardMaterial({
      map: tex(`${part}_color.jpg`, true),
      normalMap: tex(`${part}_normal.jpg`, false),
      roughnessMap: tex(`${part}_rough.jpg`, false),
      roughness: 1,
      metalness: 0,
    });
    if (part === 'head') {
      m.emissive.setHex(0x3a1a10);
      m.emissiveIntensity = 0.35;
      m.emissiveMap = m.map;
    }
    this.bag.track(m, 1);
    return m;
  }

  private poseLegs(): void {
    const q = this.root.getWorldQuaternion(this.rootQ);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      aim(this.bones[`${side}_Thigh`], this.bones[`${side}_Calf`], this.tmp.set(sx * 0.03, -0.1, 1).normalize().applyQuaternion(q));
      aim(this.bones[`${side}_Calf`], this.bones[`${side}_Foot`], this.tmp.set(0, -1, -0.04).normalize().applyQuaternion(q));
      aim(this.bones[`${side}_Foot`], this.bones[`${side}_Toe0`], this.tmp.set(0, -0.05, 1).normalize().applyQuaternion(q));
    }
  }

  private buildProps(): void {
    const s = this.spec;
    const p = this.props;
    // water glass + coffee, positioned on the side the person's free hand is on
    const gx = s.female ? -0.3 : 0.31;
    const glass = createWaterGlass({ level: 0.5 + this.rand() * 0.35 });
    glass.position.set(gx, TABLE_Y, 0.7);
    p.add(glass);
    if (s.activity !== 'laptop') {
      const cx = s.female ? 0.32 : -0.33;
      const cup = createCoffeeCup({ fill: 0.4 + this.rand() * 0.5, angle: this.rand() * 6 });
      cup.position.set(cx, TABLE_Y, 0.62);
      p.add(cup);
    }

    if (s.activity === 'notes') {
      const paper = canvasTexture(256, 360, (ctx, w, h) => {
        ctx.fillStyle = '#fbfaf5';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#c9d3df';
        ctx.lineWidth = 1;
        for (let y = 40; y < h; y += 22) {
          ctx.beginPath();
          ctx.moveTo(12, y);
          ctx.lineTo(w - 12, y);
          ctx.stroke();
        }
        const r = rng(s.seed + 9);
        ctx.strokeStyle = '#25308a';
        ctx.lineWidth = 2;
        for (let y = 36; y < h * 0.62; y += 22) {
          ctx.beginPath();
          let x = 20;
          ctx.moveTo(x, y);
          const end = 60 + r() * (w - 90);
          while (x < end) {
            x += 5 + r() * 6;
            ctx.lineTo(x, y - 4 + r() * 8);
          }
          ctx.stroke();
        }
      });
      const pad = this.bag.make(0xffffff, { rough: 0.9 });
      pad.map = paper;
      const padMesh = box(pad, 0.21, 0.012, 0.297, s.female ? -0.04 : 0.05, TABLE_Y + 0.006, 0.55, p);
      padMesh.rotation.y = s.female ? 0.12 : -0.08;
      const bind = this.bag.make(0x222222, { rough: 0.5 });
      const b = box(bind, 0.21, 0.014, 0.012, 0, 0.0, -0.145, padMesh);
      b.scale.set(1, 1.2, 0.04);
    }

    if (s.activity === 'laptop') {
      const alu = this.bag.make(0xb7bcc2, { rough: 0.35, metal: 0.8 });
      const key = this.bag.make(0x15171a, { rough: 0.6 });
      box(alu, 0.33, 0.014, 0.23, 0, TABLE_Y + 0.007, 0.66, p);
      box(key, 0.29, 0.003, 0.1, 0, TABLE_Y + 0.0155, 0.64, p);
      box(alu, 0.1, 0.002, 0.065, 0, TABLE_Y + 0.0145, 0.74, p);
      const lid = new Group();
      lid.position.set(0, TABLE_Y + 0.014, 0.775);
      lid.rotation.x = 0.28;
      p.add(lid);
      box(alu, 0.33, 0.22, 0.007, 0, 0.11, 0, lid);
      const screenTex = canvasTexture(512, 320, (ctx, w, h) => {
        ctx.fillStyle = '#16181d';
        ctx.fillRect(0, 0, w, h);
        const r = rng(77);
        const cols = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#c0caf5'];
        for (let y = 20; y < h - 10; y += 16) {
          let x = 24 + Math.floor(r() * 3) * 18;
          const n = 2 + Math.floor(r() * 4);
          for (let i = 0; i < n; i++) {
            const len = 20 + r() * 70;
            ctx.fillStyle = cols[Math.floor(r() * cols.length)];
            ctx.fillRect(x, y, len, 7);
            x += len + 8;
          }
        }
      });
      const scr = new MeshBasicMaterial({ map: screenTex, toneMapped: false });
      const plane = new Mesh(new PlaneGeometry(0.305, 0.195), scr);
      plane.rotation.y = Math.PI;
      plane.position.set(0, 0.11, -0.0045);
      lid.add(plane);
      const logo = new Mesh(
        new PlaneGeometry(0.04, 0.04),
        new MeshBasicMaterial({ color: 0xe8eaed }),
      );
      logo.position.set(0, 0.11, 0.0041);
      lid.add(logo);
    }
  }


  // ------------------------------------------------------------- behaviour

  setLookTarget(world: Vector3): void {
    this.look.copy(world);
  }

  /** Rebuilds the name tag (used when a seat is assigned to a Boardroom agent). */
  setName(name: string): void {
    this.labelTex.idle.dispose();
    this.labelTex.talk.dispose();
    this.labelTex = { idle: labelTexture(name, false), talk: labelTexture(name, true) };
    this.labelMat.map = this.speaking ? this.labelTex.talk : this.labelTex.idle;
    this.labelMat.needsUpdate = true;
    this.root.name = `person-${name}`;
  }

  setSpeaking(on: boolean): void {
    if (on === this.speaking) return;
    this.speaking = on;
    this.labelMat.map = on ? this.labelTex.talk : this.labelTex.idle;
    this.labelMat.needsUpdate = true;
  }

  /** Razonando la respuesta: baja la cabeza hacia sus apuntes. */
  setThinking(on: boolean): void {
    this.thinking = on;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** World pose of the name tag (the hit area for editing the director sits on it). */
  labelPose(pos: Vector3, quat: Quaternion): void {
    this.label.getWorldPosition(pos);
    this.label.getWorldQuaternion(quat);
  }

  get female(): boolean {
    return !!this.spec.female;
  }

  /** Writes the world position of the head into `out`. */
  headWorld(out: Vector3): Vector3 {
    if (this.loaded) {
      this.bones.Head.getWorldPosition(out);
      out.y += 0.08;
    } else {
      this.root.getWorldPosition(out);
      out.y += 1.3;
    }
    return out;
  }

  private setMorph(name: string, v: number): void {
    const i = this.morph[name];
    if (i !== undefined && this.skinned?.morphTargetInfluences) {
      this.skinned.morphTargetInfluences[i] = v;
    }
  }

  update(dt: number, time: number, viewer: Vector3): void {
    const t = time + this.phase;
    this.root.updateWorldMatrix(true, true);

    // label faces the viewer (yaw only)
    this.tmp.copy(viewer);
    this.root.worldToLocal(this.tmp);
    this.label.rotation.y = Math.atan2(this.tmp.x, this.tmp.z);
    this.label.position.y = 1.62 + Math.sin(t * 0.9) * 0.004;
    if (!this.loaded) return;

    const k = 1 - Math.exp(-dt * 5);

    // --- gaze target in the person's local frame
    this.bones.Head.getWorldPosition(this.tmp2);
    this.root.worldToLocal(this.tmp2);
    this.tmp.copy(this.look);
    this.root.worldToLocal(this.tmp);
    this.tmp.sub(this.tmp2);
    const hz = Math.hypot(this.tmp.x, this.tmp.z);
    let yawT = Math.atan2(this.tmp.x, this.tmp.z);
    let pitchT = -Math.atan2(this.tmp.y, hz);
    yawT = Math.max(-1.15, Math.min(1.15, yawT));
    pitchT = Math.max(-0.35, Math.min(0.45, pitchT));

    this.nextGlance -= dt;
    if (this.nextGlance <= 0) {
      this.glanceDown = this.glanceDown > 0 ? 0 : 1;
      const needsNotes = this.spec.activity !== 'listening';
      this.nextGlance = this.glanceDown
        ? 1.2 + this.rand() * 2.2
        : (needsNotes ? 2 : 5) + this.rand() * 5;
      if (!needsNotes && this.rand() < 0.5) this.glanceDown = 0;
    }
    if (this.speaking) this.glanceDown = 0;
    else if (this.thinking) {
      this.glanceDown = 1;
      this.nextGlance = 1; // al terminar de pensar retoma su ritmo normal
    }
    pitchT += this.glanceDown * 0.38 + (this.thinking && !this.speaking ? 0.18 : 0);
    yawT += Math.sin(t * 0.35) * 0.02;
    pitchT += Math.sin(t * 0.5 + 1) * 0.015;
    this.yaw += (yawT - this.yaw) * k;
    this.pitch += (pitchT - this.pitch) * k;

    // --- spine / neck / head, driven in the person's frame
    const rq = this.root.getWorldQuaternion(this.rootQ);
    const axY = va.set(0, 1, 0).applyQuaternion(rq).clone();
    const axX = vb.set(1, 0, 0).applyQuaternion(rq).clone();
    const axZ = vc.set(0, 0, 1).applyQuaternion(rq).clone();
    // swivel the chair towards the target first, then torso, then head
    const swivelT = Math.max(-0.5, Math.min(0.5, this.yaw * 0.35));
    this.swivel += (swivelT - this.swivel) * k;
    this.av.rotation.y = this.avYaw + this.swivel;
    const rest = this.yaw - this.swivel;
    const torsoYaw = rest * 0.4;
    const headYaw = rest - torsoYaw;
    const breath = Math.sin(t * 1.35);
    const B = this.bones;
    const put = (n: string, f: (b: Bone) => void) => {
      B[n].quaternion.copy(this.baseQ[n]);
      B[n].updateMatrixWorld(true);
      f(B[n]);
    };
    put('Spine', (b) => {
      spin(b, axX, 0.1 + breath * 0.006);
      spin(b, axZ, Math.sin(t * 0.17) * 0.015);
    });
    put('Spine1', (b) => spin(b, axY, torsoYaw * 0.4));
    put('Spine2', (b) => {
      spin(b, axY, torsoYaw * 0.6);
      spin(b, axX, breath * 0.008);
    });
    put('Neck', (b) => {
      spin(b, axY, headYaw * 0.4);
      spin(b, axX, this.pitch * 0.4 - 0.03);
    });
    put('Head', (b) => {
      spin(b, axY, headYaw * 0.6);
      spin(b, axX, this.pitch * 0.6 + (this.speaking ? Math.sin(t * 2.3) * 0.03 : 0));
    });

    {
      const hq = B.Head.getWorldQuaternion(qa);
      const fwd = vd.copy(this.headFwdLocal).applyQuaternion(hq);
      B.Head.getWorldPosition(vb);
      const to = va.copy(this.look).sub(vb).normalize();
      this.debug.err = (Math.acos(Math.min(1, Math.max(-1, fwd.dot(to)))) * 180) / Math.PI;
      this.debug.yaw = this.yaw;
      this.debug.pitch = this.pitch;
    }

    // --- face
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + this.rand() * 4.5;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const p = this.blinkT / 0.17;
      blink = p < 0.5 ? p * 2 : 2 - p * 2;
      if (this.blinkT > 0.17) {
        this.blinkT = -1;
        blink = 0;
      }
    }
    blink = Math.max(blink, this.glanceDown * 0.25);
    this.setMorph('AK_09_EyeBlinkLeft', blink);
    this.setMorph('AK_10_EyeBlinkRight', blink);

    this.talkGain += ((this.speaking ? 1 : 0) - this.talkGain) * (1 - Math.exp(-dt * 8));
    this.visemeT -= dt;
    const VIS = ['AA_VI_10_aa', 'AA_VI_11_E', 'AA_VI_13_O', 'AA_VI_14_U', 'AA_VI_12_I'];
    if (this.visemeT <= 0) {
      this.visemeT = 0.09 + this.rand() * 0.1;
      this.visemeA = this.visemeB;
      this.visemeB = Math.floor(this.rand() * VIS.length);
      this.visemeMix = 0;
    }
    this.visemeMix = Math.min(1, this.visemeMix + dt / 0.1);
    const open = Math.max(0, 0.5 + 0.5 * Math.sin(t * 12) * Math.sin(t * 4.7 + 1));
    VIS.forEach((v, i) => {
      let w = 0;
      if (i === this.visemeA) w += 1 - this.visemeMix;
      if (i === this.visemeB) w += this.visemeMix;
      this.setMorph(v, w * 0.55 * this.talkGain * (0.4 + open * 0.6));
    });
    this.setMorph('AK_25_JawOpen', this.talkGain * open * 0.35);
    const smile = 0.12 + 0.1 * Math.sin(t * 0.3) + this.talkGain * 0.12;
    this.setMorph('AK_44_MouthSmileLeft', Math.max(0, smile));
    this.setMorph('AK_45_MouthSmileRight', Math.max(0, smile));
    this.setMorph('AK_03_BrowInnerUp', 0.08 + this.talkGain * 0.2 * (0.5 + 0.5 * Math.sin(t * 2.1)));
    this.setMorph('AK_04_BrowOuterUpLeft', this.talkGain * 0.15 * (0.5 + 0.5 * Math.sin(t * 1.7)));
    this.setMorph('AK_05_BrowOuterUpRight', this.talkGain * 0.15 * (0.5 + 0.5 * Math.sin(t * 1.9)));

    // --- arms
    this.gesture += ((this.speaking ? 1 : 0) - this.gesture) * (1 - Math.exp(-dt * 3));
    this.solveArms(t);
  }

  private solveArms(t: number): void {
    const act = this.spec.activity;
    const q = this.root.getWorldQuaternion(this.rootQ);
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? 1 : -1; // 0 = left (+X), 1 = right (-X)
      const A = this.arms[i];
      for (const b of [A.upper, A.fore, A.hand, A.thumb, ...A.fingers.flat()]) {
        b.quaternion.copy(this.armBase.get(b) as Quaternion);
      }
      A.upper.updateMatrixWorld(true);
      this.H.set(sx * 0.2, TABLE_Y + 0.03, 0.38);
      this.F.set(-sx * 0.12, -0.02, 1);
      let curl = 1;
      if (act === 'notes') {
        if (i === 1) {
          this.H.set(-0.08 + Math.sin(t * 6.5) * 0.012, TABLE_Y + 0.05, 0.43 + Math.cos(t * 2.7) * 0.014);
          this.F.set(0.25, -0.2, 1);
          curl = 2.2;
        } else {
          this.H.set(0.2, TABLE_Y + 0.03, 0.4);
        }
      } else if (act === 'laptop') {
        const tap = Math.max(0, Math.sin(t * 11 + i * 2)) * 0.004;
        this.H.set(sx * 0.1, TABLE_Y + 0.06 + tap, 0.47);
        this.F.set(-sx * 0.05, -0.12, 1);
        curl = 1.7;
      } else {
        this.H.set(sx * 0.07, TABLE_Y + 0.035, 0.38 + (i === 1 ? 0.03 : 0));
        this.F.set(-sx * 0.45, -0.02, 1);
        curl = 1.4;
      }
      const gestureHand = act === 'notes' ? 0 : 1;
      let g = 0;
      if (i === gestureHand && this.gesture > 0.01) {
        g = smoothstep(this.gesture);
        const wave = Math.sin(t * 3.7);
        this.tmp.set(sx * (0.22 + 0.04 * wave), TABLE_Y + 0.2 + 0.05 * Math.sin(t * 2.9), 0.32 + 0.05 * Math.cos(t * 3.3));
        this.H.lerp(this.tmp, g);
        this.F.lerp(this.tmp2.set(-sx * 0.3, 0.45, 1), g);
        curl *= 1 - 0.5 * g;
      }
      this.F.normalize();
      this.W.copy(this.H).addScaledVector(this.F, -0.05);

      // shoulder (root-local) from the live skeleton
      A.upper.getWorldPosition(this.S);
      this.root.worldToLocal(this.S);
      this.pole.set(sx * 0.7, -0.8, -0.35);
      // never ask for more than ~94 % of the arm: a locked-out elbow looks robotic
      const reach = (A.l1 + A.l2) * 0.94;
      const dist = this.S.distanceTo(this.W);
      if (dist > reach) this.W.sub(this.S).multiplyScalar(reach / dist).add(this.S);
      ik2(this.S, this.W, A.l1, A.l2, this.pole, this.E);

      // aim the bones in world space
      this.root.localToWorld(vd.copy(this.S));
      this.root.localToWorld(this.tmp.copy(this.E));
      this.root.localToWorld(this.tmp2.copy(this.W));
      aim(A.upper, A.fore, this.dirA.subVectors(this.tmp, vd).normalize());
      aim(A.fore, A.hand, this.dirB.subVectors(this.tmp2, this.tmp).normalize());
      const fwdW = vc.copy(this.F).applyQuaternion(q).normalize().clone();
      aim(A.hand, A.fingers[1][0], fwdW);
      A.hand.getWorldQuaternion(this.q0);

      // roll the hand: palm towards `palm`, thumb on the inner side
      const inward = this.tmp.set(-sx, 0, 0).applyQuaternion(q).clone();
      const palm = this.tmp2
        .set(0, -1, 0)
        .multiplyScalar(1 - g)
        .addScaledVector(inward, 0.4 * g)
        .addScaledVector(UP, 0.85 * g)
        .normalize()
        .clone();
      const pos = (b: Object3D, out: Vector3) => b.getWorldPosition(out);
      const hp = new Vector3();
      const mid = new Vector3();
      const ix = new Vector3();
      const pk = new Vector3();
      const th = new Vector3();
      const read = () => {
        A.hand.updateWorldMatrix(true, true);
        pos(A.hand, hp);
        pos(A.fingers[1][0], mid);
        pos(A.fingers[0][0], ix);
        pos(A.fingers[3][0], pk);
        pos(A.thumb, th);
      };
      read();
      const fwd = mid.clone().sub(hp).normalize();
      const side = pk.clone().sub(ix);
      const n = new Vector3().crossVectors(fwd, side).normalize();
      const ang = Math.atan2(new Vector3().crossVectors(n, palm).dot(fwd), n.dot(palm));
      spin(A.hand, fwd, ang);
      read();
      // thumb side for this palm direction (palm down -> thumb towards the body)
      const thumbSide = new Vector3().crossVectors(palm, fwd).multiplyScalar(sx);
      if (th.sub(hp).dot(thumbSide) < 0) {
        spin(A.hand, fwd, Math.PI);
        read();
      }
      // share the wrist roll with the forearm (swing-twist) so the wrist does not candy-wrap
      A.hand.getWorldQuaternion(this.qF);
      this.qD.copy(this.qF).multiply(this.q0.invert());
      const axisF = this.dirB;
      let twist = 2 * Math.atan2(this.qD.x * axisF.x + this.qD.y * axisF.y + this.qD.z * axisF.z, this.qD.w);
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      spin(A.fore, axisF, twist * 0.65);
      (A.hand.parent as Object3D).getWorldQuaternion(this.qT).invert();
      A.hand.quaternion.copy(this.qT.multiply(this.qF));
      A.hand.updateMatrixWorld(true);
      read();
      // curl the fingers towards the palm
      const axis = pk.clone().sub(ix).normalize();
      const sgn = new Vector3().crossVectors(axis, fwd).dot(palm) >= 0 ? 1 : -1;
      const JOINT = [0.18, 0.3, 0.22];
      for (let f = 0; f < 4; f++) {
        for (let j = 0; j < 3; j++) {
          spin(A.fingers[f][j], axis, sgn * JOINT[j] * curl * (1 + f * 0.12));
        }
      }
      if (this.pen && i === 1) {
        // pinch grip: between the thumb's last joint and the index finger's middle joint
        this.bones.R_Finger02.getWorldPosition(va);
        this.bones.R_Finger11.getWorldPosition(vb);
        this.tmp.copy(va).add(vb).multiplyScalar(0.5);
        this.root.worldToLocal(this.tmp);
        const dir = this.dirA.copy(this.F).multiplyScalar(-0.75).addScaledVector(UP, 0.66).normalize();
        // 6.5 cm of the pen sticks out ahead of the grip, the rest rests back over the hand
        // ride on top of the hand's radial side so the barrel stays visible
        this.tmp.y += 0.016;
        this.tmp.x += 0.01;
        this.pen.position.copy(this.tmp).addScaledVector(dir, 0.14 / 2 - 0.065);
        this.pen.quaternion.setFromUnitVectors(UP, dir);
      }
    }
  }
}
