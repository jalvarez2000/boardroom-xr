import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';

const PULSES = 3;
const SPARKS = 14;
const PERIOD = 2.6; // segundos que tarda cada onda en abrirse

interface Spark {
  mesh: Mesh;
  radius: number;
  speed: number;
  phase: number;
  lift: number;
}

/**
 * Aviso visual de que la sala espera algo del servidor: sobre el centro de la mesa late un orbe de luz,
 * se abren ondas sobre el tablero y unas chispas orbitan alrededor. Sin texto ni nada técnico.
 */
export class Waiting {
  readonly group = new Group();
  private level = 0;
  private orb: Mesh;
  private halo: Mesh;
  private rings: Mesh[] = [];
  private sparks: Spark[] = [];
  private color = new Color(0x8b9bff);
  private mats: MeshBasicMaterial[] = [];
  private mode = false;

  constructor() {
    const mat = (opacity: number) => {
      const m = new MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.mats.push(m);
      return m;
    };

    this.orb = new Mesh(new SphereGeometry(0.05, 24, 16), mat(0.9));
    this.halo = new Mesh(new SphereGeometry(0.11, 24, 16), mat(0.18));
    this.orb.position.y = this.halo.position.y = 0.28;
    this.group.add(this.orb, this.halo);

    const ringGeo = new RingGeometry(0.96, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < PULSES; i++) {
      const r = new Mesh(ringGeo, mat(0));
      r.position.y = 0.004;
      this.rings.push(r);
      this.group.add(r);
    }

    const sparkGeo = new SphereGeometry(0.012, 8, 6);
    for (let i = 0; i < SPARKS; i++) {
      const mesh = new Mesh(sparkGeo, mat(0.8));
      this.sparks.push({
        mesh,
        radius: 0.13 + (i % 4) * 0.05,
        speed: (i % 2 ? 1 : -1) * (0.8 + (i % 5) * 0.18),
        phase: (i / SPARKS) * Math.PI * 2,
        lift: 0.28 + (((i * 37) % 11) - 5) * 0.012,
      });
      this.group.add(mesh);
    }
    this.group.visible = false;
  }

  /** `active` = hay algo esperando respuesta; el efecto entra y sale con suavidad. */
  update(dt: number, t: number, active: boolean, listening = false, voice = 0): void {
    // al escuchar, el orbe se vuelve verde y late con la voz
    if (listening !== this.mode) {
      this.mode = listening;
      this.color.set(listening ? 0x4ade80 : 0x8b9bff);
      for (const m of this.mats) m.color.copy(this.color);
    }
    this.level += ((active ? 1 : 0) - this.level) * (1 - Math.exp(-dt * (active ? 3.5 : 2.5)));
    const lv = this.level;
    this.group.visible = lv > 0.01;
    if (!this.group.visible) return;

    // el orbe respira y flota
    const breath = listening ? Math.min(1, 0.35 + voice * 1.4 + 0.15 * Math.sin(t * 6)) : 0.5 + 0.5 * Math.sin(t * 2.4);
    const bob = Math.sin(t * 1.3) * 0.012;
    this.orb.position.y = this.halo.position.y = 0.28 + bob;
    this.orb.scale.setScalar(lv * (0.85 + 0.3 * breath));
    this.halo.scale.setScalar(lv * (0.9 + 0.5 * breath));
    (this.orb.material as MeshBasicMaterial).opacity = 0.9 * lv;
    (this.halo.material as MeshBasicMaterial).opacity = (0.1 + 0.14 * breath) * lv;

    // ondas que se abren desde el centro y se desvanecen
    this.rings.forEach((r, i) => {
      const k = ((t / (listening ? PERIOD * 0.55 : PERIOD) + i / PULSES) % 1 + 1) % 1;
      const ease = 1 - (1 - k) * (1 - k);
      r.scale.setScalar(0.06 + ease * 0.62);
      (r.material as MeshBasicMaterial).opacity = (1 - k) * (1 - k) * 0.55 * lv;
    });

    // chispas orbitando
    for (const s of this.sparks) {
      const a = s.phase + t * s.speed;
      const rad = s.radius * (0.6 + 0.4 * lv);
      s.mesh.position.set(Math.cos(a) * rad, s.lift + Math.sin(a * 1.7 + s.phase) * 0.03 + bob, Math.sin(a) * rad);
      (s.mesh.material as MeshBasicMaterial).opacity = (0.35 + 0.45 * Math.sin(t * 3 + s.phase * 3) ** 2) * lv;
    }
  }
}
