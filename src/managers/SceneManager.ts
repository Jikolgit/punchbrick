import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  private container: HTMLElement;

  // Variables pour le Screen Shake
  private baseCameraPosition = new THREE.Vector3(16.29, 13.05, 9.54);
  private shakeIntensity = 0;
  private shakeDecay = 5;

  constructor() {
    const containerElement = document.getElementById('game-container');
    if (!containerElement) {
      throw new Error("L'élément #game-container est introuvable dans le DOM.");
    }
    this.container = containerElement;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.copy(this.baseCameraPosition);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.5, 0);
    this.controls.update();

    this.setupLights();
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);
  }

  /**
   * Déclenche une secousse de caméra à l'impact
   */
  public triggerImpactShake(intensity: number = 0.5): void {
    this.shakeIntensity = intensity;
  }

  /**
   * Applique le screen shake à l'impact
   */
  public updateCinematicCamera(deltaTime: number): void {
    if (this.shakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      const shakeZ = (Math.random() - 0.5) * this.shakeIntensity;

      this.camera.position.add(new THREE.Vector3(shakeX, shakeY, shakeZ));
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * deltaTime);
    }

    this.controls.update();
  }

  private onWindowResize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}