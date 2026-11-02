import { type Entity, type Object3D, RayInteractable, type Texture, type World } from '@iwsdk/core';
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { BOARD_H, BOARD_W } from './whiteboard-draw.js';
import { ROOM } from './room.js';
import { board } from './whiteboard.js';

/** Presentación cercana: la página flota delante del CEO, a una distancia en la que cada zona supera los 3° de la mirada. */
export const NEAR = { x: 0, y: 1.26, z: -1.3, w: 1.3 };

interface Hit {
  mesh: Mesh;
  entity: Entity;
}

/**
 * Convierte la mirada (o el rayo de la mano si falla) sobre la pizarra en zonas señalables: cada movimiento del
 * rayo engancha la zona más cercana y un pellizco la fija. Hay dos superficies: la pantalla de la pared y la
 * tarjeta cercana.
 */
export class BoardPointer {
  /** tarjeta cercana con la página (además de la pared) */
  readonly card: Mesh;
  private frame: Mesh;
  private hits: Hit[] = [];
  private wall: Mesh;

  constructor(world: World, texture: Texture, cleanup: (() => void)[]) {
    // tarjeta cercana
    const h = (NEAR.w * BOARD_H) / BOARD_W;
    this.card = new Mesh(new PlaneGeometry(NEAR.w, h), new MeshBasicMaterial({ map: texture, toneMapped: false }));
    this.card.position.set(NEAR.x, NEAR.y, NEAR.z);
    this.frame = new Mesh(new BoxGeometry(NEAR.w + 0.06, h + 0.06, 0.02), new MeshBasicMaterial({ color: 0x0a0c10, toneMapped: false }));
    this.frame.position.set(NEAR.x, NEAR.y, NEAR.z - 0.012);

    // superficie invisible sobre la pantalla de la pared (la pared no es una entidad)
    this.wall = new Mesh(
      new PlaneGeometry(2.5, 1.4),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.wall.position.set(0, 1.5, ROOM.zMin + 0.1);

    world.scene.add(this.frame);
    for (const mesh of [this.card, this.wall]) {
      const entity = world.createTransformEntity(mesh as unknown as Object3D);
      entity.addComponent(RayInteractable);
      this.hits.push({ mesh, entity });
      this.listen(mesh, cleanup);
    }
    cleanup.push(() => this.frame.removeFromParent());
    this.sync(false);
  }

  private listen(mesh: Mesh, cleanup: (() => void)[]): void {
    // coordenadas del canvas de la pizarra a partir de la uv del impacto
    const at = (e: { uv?: { x: number; y: number } }): [number, number] | null =>
      e.uv ? [e.uv.x * BOARD_W, (1 - e.uv.y) * BOARD_H] : null;
    const move = (e: { uv?: { x: number; y: number } }) => {
      const p = at(e);
      if (p) board.focusAt(p[0], p[1]);
    };
    const leave = () => board.clearFocus();
    const click = (e: { uv?: { x: number; y: number } }) => {
      const p = at(e);
      if (p) board.pinAt(p[0], p[1]);
    };
    const target = mesh as unknown as {
      addEventListener: (t: string, f: (e: never) => void) => void;
      removeEventListener: (t: string, f: (e: never) => void) => void;
    };
    const events: [string, (e: never) => void][] = [
      ['pointerenter', move as (e: never) => void],
      ['pointermove', move as (e: never) => void],
      ['pointerleave', leave],
      ['click', click as (e: never) => void],
    ];
    for (const [t, f] of events) {
      target.addEventListener(t, f);
      cleanup.push(() => target.removeEventListener(t, f));
    }
  }

  /** La tarjeta solo existe en XR mientras hay algo presentado cerca; las superficies de mirada, mientras haya página. */
  sync(inXr: boolean): void {
    const has = board.pages.length > 0;
    const near = inXr && has && board.near && !board.onTablet;
    this.card.visible = near;
    this.frame.visible = near;
    if (this.hits[0]) this.hits[0].mesh.visible = near;
    if (this.hits[1]) this.hits[1].mesh.visible = inXr && has && !near;
  }
}
