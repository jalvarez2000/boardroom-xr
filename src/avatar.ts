import {
  Bone,
  Box3,
  Group,
  LoadingManager,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const TINY =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Loads a Rocketbox FBX, ignoring the TGA textures it references (we ship converted ones). */
export async function loadFbx(url: string): Promise<Group> {
  const manager = new LoadingManager();
  manager.setURLModifier((u) => (/\.(tga|png|jpe?g)$/i.test(u) ? TINY : u));
  const loader = new FBXLoader(manager);
  return loader.loadAsync(url);
}

export function describe(root: Object3D): unknown {
  const meshes: unknown[] = [];
  const bones: string[] = [];
  root.traverse((o) => {
    if ((o as Bone).isBone) bones.push(o.name);
    const m = o as Mesh;
    if (m.isMesh) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      meshes.push({
        name: m.name,
        skinned: (m as SkinnedMesh).isSkinnedMesh === true,
        tris: Math.round((m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3),
        mats: mats.map((x) => x.name),
        morphs: m.morphTargetDictionary ? Object.keys(m.morphTargetDictionary).length : 0,
      });
    }
  });
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  return { size: size.toArray(), meshes, bones: bones.length, boneNames: bones };
}
