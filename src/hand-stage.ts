import {
  AmbientLight,
  Bone,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  RepeatWrapping,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { loadFbx } from './avatar.js';

const MODEL = 'Business_Male_01';
const TEX = 'm005';

const qa = new Quaternion();
const qb = new Quaternion();
const qc = new Quaternion();

/** Gira `bone` un ángulo alrededor de un eje en coordenadas del mundo, encima de su pose actual. */
function spin(bone: Object3D, axis: Vector3, angle: number): void {
  bone.updateWorldMatrix(true, false);
  qa.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(qb);
  (bone.parent as Object3D).getWorldQuaternion(qc).invert();
  bone.quaternion.copy(qc.multiply(qa).multiply(qb));
  bone.updateMatrixWorld(true);
}

/** Pose de la mano: cuánto se cierra cada dedo (0 abierto … 1 enroscado) y dónde está el pulgar. */
export interface HandPose {
  /** índice enroscado */
  index: number;
  /** corazón, anular y meñique */
  fist: number;
  /** pulgar: abre / cierra hacia el índice (0 reposo … 1 sobre el índice) */
  thumbIn: number;
  /** pulgar: se flexiona (0 estirado … 1 doblado) */
  thumbBend: number;
  /** pulgar: sube (+1) o baja (-1) respecto al lateral del índice */
  thumbLift: number;
  /** pulgar: se desliza hacia la punta del índice (+1) o hacia la palma (-1) */
  thumbSlide: number;
}

export const REST_POSE: HandPose = { index: 0.8, fist: 1, thumbIn: 0.5, thumbBend: 0.3, thumbLift: 0, thumbSlide: 0 };

/**
 * Mano 3D de un avatar Rocketbox de la sala, dibujada con su propio renderizador pequeño y fuera de pantalla.
 * El resultado (`canvas`) se pega en las ilustraciones del tutorial, tanto en el navegador como en XR.
 */
export class HandStage {
  readonly canvas = document.createElement('canvas');
  ready = false;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.02, 3);
  private bones: Record<string, Bone> = {};
  private axis = new Vector3();
  private fwd = new Vector3();
  private normal = new Vector3();
  private base = new Map<Bone, Quaternion>();
  private center = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  /** cámara: ángulo alrededor de la mano (rad) y distancia */
  view = { yaw: 0.3, pitch: 0.15, dist: 0.56 };

  constructor(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.scene.add(new HemisphereLight(0xffffff, 0x8a7a6a, 1.5), new AmbientLight(0xffffff, 0.5));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(0.5, 1, 0.6);
    this.scene.add(key);
    void this.load().catch(() => {});
  }

  private async load(): Promise<void> {
    const dir = `./models/${MODEL}`;
    const src = await loadFbx(`${dir}/avatar.fbx`);
    src.scale.setScalar(0.01);
    const loader = new TextureLoader();
    const tex = (file: string, srgb: boolean): Texture => {
      const t = loader.load(`${dir}/${TEX}_${file}`);
      t.colorSpace = srgb ? SRGBColorSpace : '';
      t.wrapS = t.wrapT = RepeatWrapping;
      return t;
    };
    const skin = new MeshStandardMaterial({ map: tex('body_color.jpg', true), normalMap: tex('body_normal.jpg', false), roughnessMap: tex('body_rough.jpg', false), roughness: 1 });
    src.traverse((o) => {
      const bone = o as Bone;
      if (bone.isBone) this.bones[bone.name.replace('Bip01_', '')] = bone;
      const mesh = o as SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.frustumCulled = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const next = mats.map((m: Material) => {
          const n = m.name.toLowerCase();
          // lo único que se ve es la mano: la cabeza, el pelo y las gafas no hacen falta
          if (n.includes('opacity') || n.includes('glasses') || n.includes('head')) {
            const hidden = new MeshStandardMaterial({ visible: false });
            return hidden;
          }
          return skin;
        });
        mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
      }
    });
    const g = new Group();
    g.add(src);
    this.scene.add(g);
    g.updateMatrixWorld(true);
    for (const b of Object.values(this.bones)) this.base.set(b, b.quaternion.clone());
    this.ready = true;
  }

  private pos(name: string, out: Vector3): Vector3 {
    return (this.bones[name] as Bone).getWorldPosition(out);
  }

  /** Coloca la mano en la pose y la dibuja. */
  render(p: HandPose): void {
    if (!this.ready) return;
    const B = this.bones;
    for (const [bone, q] of this.base) bone.quaternion.copy(q);
    this.scene.updateMatrixWorld(true);

    // ejes de la mano en reposo: hacia los dedos y a lo ancho de los nudillos
    this.pos('R_Hand', this.a);
    this.pos('R_Finger2', this.b);
    this.fwd.copy(this.b).sub(this.a).normalize();
    const palm = new Vector3(0, -1, 0);
    this.pos('R_Finger1', this.b);
    this.pos('R_Finger4', this.c);
    this.axis.copy(this.c).sub(this.b).normalize();
    this.pos('R_Finger2', this.b);
    this.pos('R_Hand', this.a);
    this.fwd.copy(this.b).sub(this.a).normalize();
    this.normal.crossVectors(this.fwd, this.axis).normalize();
    const sgn = new Vector3().crossVectors(this.axis, this.fwd).dot(palm) >= 0 ? 1 : -1;
    const curl = (names: string[], k: number, joints: number[]) =>
      names.forEach((n, j) => spin(B[n] as Bone, this.axis, sgn * (joints[j] ?? 0) * k));
    curl(['R_Finger1', 'R_Finger11', 'R_Finger12'], p.index, [1.15, 1.6, 0.9]);
    for (const f of [2, 3, 4]) curl([`R_Finger${f}`, `R_Finger${f}1`, `R_Finger${f}2`], p.fist, [1.3, 1.7, 1.0]);

    // pulgar: se acerca al índice (alrededor de la normal), se dobla y se desliza (a lo ancho)
    const t = ['R_Finger0', 'R_Finger01', 'R_Finger02'] as const;
    spin(B[t[0]] as Bone, this.normal, -sgn * p.thumbIn * 0.9);
    spin(B[t[0]] as Bone, this.axis, sgn * (p.thumbLift * 0.45 + 0.2));
    spin(B[t[1]] as Bone, this.axis, sgn * p.thumbBend * 0.8);
    spin(B[t[2]] as Bone, this.axis, sgn * p.thumbBend * 0.5);
    spin(B[t[0]] as Bone, this.fwd, p.thumbSlide * 0.35);

    this.scene.updateMatrixWorld(true);
    // cámara alrededor del centro de la mano
    this.pos('R_Hand', this.center);
    this.pos('R_Finger2', this.b);
    this.center.lerp(this.b, 0.8);
    // la cámara mira la mano desde el lado del pulgar (radial): así se ve el pulgar apoyado sobre el índice
    const { yaw, pitch, dist } = this.view;
    this.a.copy(this.axis).multiplyScalar(-1).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    this.camera.position.copy(this.center).addScaledVector(this.a, Math.cos(pitch) * dist);
    this.camera.position.y += Math.sin(pitch) * dist;
    // la mano cuelga en reposo: se gira la imagen para que los dedos apunten a la izquierda
    this.b.copy(this.center).sub(this.camera.position).normalize();
    this.camera.up.crossVectors(this.b, this.fwd).normalize();
    this.camera.lookAt(this.center);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
