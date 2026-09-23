import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedModels {
  brick: THREE.Object3D;
  fist: THREE.Object3D;
}

export class ModelLoader {
  private static gltfLoader = new GLTFLoader();
  private static textureLoader = new THREE.TextureLoader();

  public static async loadModels(): Promise<LoadedModels> {
    // 1. Chargement parallèle des textures et du fichier .glb
    const [gltf, brickTexture, fistTexture] = await Promise.all([
      this.loadGLTF('/models.glb'),
      this.loadTexture('/brickTXT.jpg'),
      this.loadTexture('/fistTXT.jpg'),
    ]);

    // 2. Correction de l'espace de couleur des textures
    brickTexture.colorSpace = THREE.SRGBColorSpace;
    brickTexture.flipY = false; // Inverse l'axe Y si nécessaire selon l'UV Map de Blender

    fistTexture.colorSpace = THREE.SRGBColorSpace;
    fistTexture.flipY = false;

    // 3. Extraction des objets 3D par leur nom
    const brick = gltf.scene.getObjectByName('brick_1'); //[cite: 4]
    const fist = gltf.scene.getObjectByName('fist_1'); //[cite: 4]

    if (!brick || !fist) {
      throw new Error("Impossible de trouver 'brick_1' ou 'fist_1' dans models.glb"); //[cite: 4]
    }

    // 4. Application des textures aux matériaux
    this.applyTextureToMesh(brick, brickTexture);
    this.applyTextureToMesh(fist, fistTexture);

    return {
      brick: brick.clone(),
      fist: fist.clone(),
    };
  }

  private static loadGLTF(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  private static loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  private static applyTextureToMesh(object: THREE.Object3D, texture: THREE.Texture): void {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.4,
          metalness: 0.1,
        });
      }
    });
  }
}