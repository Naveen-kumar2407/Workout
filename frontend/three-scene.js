import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

const PERSON_COLORS = [
  0x50c878,
  0x64b5f6,
  0xffb74d,
  0xf48fb1,
];

export class SkeletonScene {
  constructor(container) {
    this.container = container;
    this.peopleGroups = new Map();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 480;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
    this.camera.position.set(0, 0.2, 2.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);

    const grid = new THREE.GridHelper(2, 20, 0x30363d, 0x21262d);
    grid.position.y = -0.5;
    this.scene.add(grid);

    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._animate();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updatePeople(people) {
    const seen = new Set();

    people.forEach((person) => {
      const id = person.id;
      seen.add(id);
      let group = this.peopleGroups.get(id);
      if (!group) {
        group = this._createPersonGroup(id);
        this.peopleGroups.set(id, group);
        this.scene.add(group);
      }
      this._updatePersonGroup(group, person.landmarks_3d || person.landmarks_2d, id);
    });

    for (const [id, group] of this.peopleGroups) {
      if (!seen.has(id)) {
        this.scene.remove(group);
        group.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
        this.peopleGroups.delete(id);
      }
    }

    if (people.length > 0) {
      const lm = people[0].landmarks_3d || people[0].landmarks_2d;
      if (lm && lm.length) {
        const xs = lm.map((p) => p.x);
        const ys = lm.map((p) => p.y);
        const zs = lm.map((p) => p.z);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        this.controls.target.lerp(new THREE.Vector3(cx, -cy, -cz), 0.1);
      }
    }
  }

  _createPersonGroup(id) {
    const group = new THREE.Group();
    group.userData.id = id;
    group.userData.joints = [];
    group.userData.bones = [];
    const color = PERSON_COLORS[id % PERSON_COLORS.length];

    for (let i = 0; i < 33; i++) {
      const geo = new THREE.SphereGeometry(0.02, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      group.userData.joints.push(mesh);
    }

    const boneMat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    for (const [a, b] of CONNECTIONS) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(),
      ]);
      const line = new THREE.Line(geo, boneMat);
      group.add(line);
      group.userData.bones.push({ line, a, b });
    }

    return group;
  }

  _updatePersonGroup(group, landmarks, id) {
    if (!landmarks || landmarks.length < 33) return;

    const offsetX = (id - 1.5) * 0.3;

    landmarks.forEach((p, i) => {
      const joint = group.userData.joints[i];
      if (joint) {
        joint.position.set(p.x + offsetX, -p.y, -p.z);
      }
    });

    group.userData.bones.forEach(({ line, a, b }) => {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) return;
      const positions = line.geometry.attributes.position;
      positions.setXYZ(0, pa.x + offsetX, -pa.y, -pa.z);
      positions.setXYZ(1, pb.x + offsetX, -pb.y, -pb.z);
      positions.needsUpdate = true;
    });
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
