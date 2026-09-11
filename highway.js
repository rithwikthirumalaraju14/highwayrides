import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMoon } from './moon.js';

export function createHighway(container, onFrame) {
    const compact = matchMedia('(pointer: coarse)').matches
        || (navigator.deviceMemory && navigator.deviceMemory <= 4)
        || navigator.hardwareConcurrency <= 4;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.006);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 650);
    camera.position.set(0, 2.2, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: !compact, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-label', 'A moonlit highway with warm streetlights');
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.2, -50);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minAzimuthAngle = -0.15;
    controls.maxAzimuthAngle = 0.15;
    controls.minPolarAngle = Math.PI / 2 - 0.075;
    controls.maxPolarAngle = Math.PI / 2;
    controls.update();
    controls.enabled = false;

    scene.add(new THREE.HemisphereLight(0x9ebbe0, 0x18131a, 0.35));
    const moonlight = new THREE.DirectionalLight(0x99b9e4, 0.4);
    moonlight.position.set(-20, 60, -100);
    scene.add(moonlight);

    let running = false;
    let prepared = false;
    let disposed = false;
    let frame = 0;
    let previousTime = 0;
    let lastTick = 0;
    let distance = 0;
    let quality = 1;
    let slowFrameTime = 0;
    let sampledFrames = 0;
    const frameInterval = 1000 / 30;

    const moon = createMoon(scene, renderer, () => {
        if (prepared && !running && !document.hidden && !disposed) render();
    });
    const transform = new THREE.Object3D();
    const roadWidth = 24;
    const visibleLength = 665;
    const spacing = 35;
    const lampCount = 19;

    // This small texture supplies smooth local halos and pools of light.
    // It replaces full-resolution multi-pass bloom and is generated only once.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext('2d');
    const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.12, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);

    function mesh(geometry, material, x, y, z, parent = scene) {
        const object = new THREE.Mesh(geometry, material);
        object.position.set(x, y, z);
        parent.add(object);
        return object;
    }

    function instances(geometry, material, count, setTransform, parent = scene) {
        const object = new THREE.InstancedMesh(geometry, material, count);
        for (let index = 0; index < count; index++) {
            transform.position.set(0, 0, 0);
            transform.rotation.set(0, 0, 0);
            transform.scale.set(1, 1, 1);
            setTransform(transform, index);
            transform.updateMatrix();
            object.setMatrixAt(index, transform.matrix);
        }
        object.computeBoundingSphere();
        parent.add(object);
        return object;
    }

    function glowMaterial(color, opacity) {
        return new THREE.MeshBasicMaterial({
            color, map: glowTexture, transparent: true, opacity,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
    }

    const asphalt = new THREE.MeshStandardMaterial({ color: 0x222631, roughness: 0.85, metalness: 0.05 });
    const road = mesh(new THREE.PlaneGeometry(roadWidth, visibleLength), asphalt, 0, 0, -260);
    road.rotation.x = -Math.PI / 2;
    const ground = mesh(new THREE.PlaneGeometry(500, visibleLength),
        new THREE.MeshLambertMaterial({ color: 0x0b1016 }), 0, -0.08, -260);
    ground.rotation.x = -Math.PI / 2;
    instances(new THREE.BoxGeometry(0.6, 0.3, visibleLength),
        new THREE.MeshLambertMaterial({ color: 0x444851 }), 2, (object, index) => {
            object.position.set(index === 0 ? -12.4 : 12.4, 0.15, -260);
        });

    const markingMaterial = new THREE.MeshBasicMaterial({ color: 0x8d8e8c });
    const markings = instances(new THREE.PlaneGeometry(0.16, 3), markingMaterial, 110, (object, index) => {
        object.position.set(0, 0.014, 45 - index * 6);
        object.rotation.x = -Math.PI / 2;
    });
    instances(new THREE.PlaneGeometry(0.13, visibleLength), markingMaterial, 2, (object, index) => {
        object.position.set(index === 0 ? -11.5 : 11.5, 0.015, -260);
        object.rotation.x = -Math.PI / 2;
    });

    // Repeated geometry is batched; only the nearby length of road exists.
    const street = new THREE.Group();
    scene.add(street);
    const metal = new THREE.MeshLambertMaterial({ color: 0x49505b });
    const bulb = new THREE.MeshBasicMaterial({ color: 0xffefbf, toneMapped: false });
    function lampPart(geometry, material, position, rotation = 0) {
        return instances(geometry, material, lampCount, (object, index) => {
            object.position.set(position[0], position[1], 20 - index * spacing);
            object.rotation.z = rotation;
        }, street);
    }
    lampPart(new THREE.CylinderGeometry(0.09, 0.19, 12, 8), metal, [13.1, 6]);
    lampPart(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), metal, [11.6, 11.8], Math.PI / 2 + 0.1);
    lampPart(new THREE.BoxGeometry(1.25, 0.22, 0.65), metal, [10.1, 11.6]);
    lampPart(new THREE.BoxGeometry(1.0, 0.055, 0.48), bulb, [10.1, 11.45]);

    const pools = instances(new THREE.PlaneGeometry(22, 30), glowMaterial(0xffcd78, 0.16), lampCount, (object, index) => {
        object.position.set(4.5, 0.02, 19 - index * spacing);
        object.rotation.x = -Math.PI / 2;
    }, street);
    pools.renderOrder = 1;

    // All streetlamp halos in one draw call; the quad faces the camera in GLSL.
    const haloMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            glowMap: { value: glowTexture },
            color: { value: new THREE.Color(0xffcf79) }
        },
        vertexShader: `
            varying vec2 vUv;
            #include <fog_pars_vertex>
            void main() {
                vUv = uv;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                mvPosition.xy += position.xy * 3.0;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            uniform sampler2D glowMap;
            uniform vec3 color;
            varying vec2 vUv;
            #include <fog_pars_fragment>
            void main() {
                gl_FragColor = vec4(color, texture2D(glowMap, vUv).a * 0.55);
                #include <colorspace_fragment>
                #include <fog_fragment>
            }
        `,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        fog: true, toneMapped: false
    });
    const halos = lampPart(new THREE.PlaneGeometry(1, 1), haloMaterial, [10.1, 11.4]);
    halos.frustumCulled = false;

    // A fixed pool of soft lights illuminates the nearby road and car bodies.
    // Distant lamps use the inexpensive halos/pools above, with no shadows.
    const streetLights = Array.from({ length: compact ? 2 : 3 }, () => {
        const light = new THREE.SpotLight(0xffce80, 65, 48, Math.PI / 3.3, 0.85, 2);
        scene.add(light, light.target);
        return light;
    });

    const buildingCount = 16;
    const buildingData = Array.from({ length: buildingCount }, (_, index) => ({
        x: -28 - (index % 3) * 5,
        width: 13 + (index * 7 % 17),
        height: 30 + (index * 17 % 53),
        depth: 18 + (index * 3 % 15)
    }));
    const buildings = instances(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0x111722 }), buildingCount, () => {});
    buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    buildings.frustumCulled = false;

    const carBody = new THREE.MeshStandardMaterial({ color: 0x25303e, roughness: 0.45, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x060a12, roughness: 0.24, metalness: 0.2 });
    const rubber = new THREE.MeshLambertMaterial({ color: 0x08090c });
    const redLens = new THREE.MeshBasicMaterial({ color: 0xff291c, toneMapped: false });
    const carGlow = new THREE.SpriteMaterial({
        color: 0xff2715, map: glowTexture, transparent: true, opacity: 0.65,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    const bodyGeometry = new THREE.BoxGeometry(2.1, 0.65, 4.2);
    const cabinGeometry = new THREE.BoxGeometry(1.75, 0.6, 2.25);
    const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 8);
    const lensGeometry = new THREE.BoxGeometry(0.52, 0.13, 0.08);
    const spillGeometry = new THREE.PlaneGeometry(2.7, 5.5);
    const spillMaterial = glowMaterial(0xe62012, 0.09);
    const cars = [-55, -120, -205].map((z, index) => {
        const car = new THREE.Group();
        mesh(bodyGeometry, carBody, 0, 0.7, 0, car);
        mesh(cabinGeometry, glass, 0, 1.28, -0.25, car);
        for (const x of [-1.04, 1.04]) {
            for (const axleZ of [-1.25, 1.25]) {
                mesh(wheelGeometry, rubber, x, 0.35, axleZ, car).rotation.z = Math.PI / 2;
            }
        }
        for (const x of [-0.73, 0.73]) {
            mesh(lensGeometry, redLens, x, 0.87, 2.14, car);
            const glow = new THREE.Sprite(carGlow);
            glow.position.set(x, 0.87, 2.23);
            glow.scale.set(1.0, 0.6, 1);
            car.add(glow);
        }
        const spill = mesh(spillGeometry, spillMaterial, 0, 0.025, 3.1, car);
        spill.rotation.x = -Math.PI / 2;
        car.position.set(index % 2 === 0 ? -3.2 : 3.2, 0, z);
        car.userData.speed = 7.2 + index * 0.5;
        scene.add(car);
        return car;
    });

    function updateScenery(delta) {
        const drivingSpeed = 4.8;
        distance += drivingSpeed * delta;
        markings.position.z = distance % 6;
        street.position.z = distance % spacing;
        for (let index = 0; index < streetLights.length; index++) {
            const z = 20 - index * spacing + street.position.z;
            streetLights[index].position.set(10.1, 11.35, z);
            streetLights[index].target.position.set(4.5, 0, z - 1);
            // Fade a lamp's real light out as it passes behind the viewer.
            streetLights[index].intensity = 65 * (1 - THREE.MathUtils.smoothstep(z - camera.position.z, 12, 35));
        }
        for (let index = 0; index < buildingCount; index++) {
            const data = buildingData[index];
            const z = 65 - ((index * 42 - distance) % 672 + 672) % 672;
            transform.position.set(data.x, data.height / 2, z);
            transform.rotation.set(0, 0, 0);
            transform.scale.set(data.width, data.height, data.depth);
            transform.updateMatrix();
            buildings.setMatrixAt(index, transform.matrix);
        }
        buildings.instanceMatrix.needsUpdate = true;
        for (const car of cars) {
            car.position.z += (drivingSpeed - car.userData.speed) * delta;
            if (car.position.z < -430) car.position.z = -110;
        }
    }

    function render() {
        controls.update();
        moon.update(camera);
        renderer.render(scene, camera);
    }

    function resize() {
        const width = container.clientWidth;
        const height = container.clientHeight || 1;
        const pixelBudget = compact ? 850000 : 1400000;
        const ratio = Math.min(devicePixelRatio || 1, compact ? 1 : 1.25,
            Math.sqrt(pixelBudget / (width * height))) * quality;
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (prepared && !document.hidden) render();
    }

    function tick(time) {
        frame = 0;
        if (!running || disposed || document.hidden) return;
        frame = requestAnimationFrame(tick);
        const elapsed = time - previousTime;
        if (elapsed < frameInterval) return;
        previousTime = time - elapsed % frameInterval;
        const elapsedSeconds = lastTick ? (time - lastTick) / 1000 : 0;
        lastTick = time;
        // Avoid a sudden leap after a stalled frame or a sleeping device.
        const delta = Math.min(elapsedSeconds, 0.1);
        updateScenery(delta);
        onFrame(delta);
        render();

        slowFrameTime += elapsedSeconds;
        sampledFrames++;
        // Check elapsed time as well as frame count, so a struggling device
        // scales down within a few seconds rather than waiting for 60 slow frames.
        if (slowFrameTime >= 2 && sampledFrames >= 10) {
            if (slowFrameTime / sampledFrames > 0.045 && quality > 0.65) {
                quality = Math.max(0.65, quality - 0.15);
                resize();
            }
            sampledFrames = 0;
            slowFrameTime = 0;
        }
    }

    function stopFrames() {
        cancelAnimationFrame(frame);
        frame = 0;
        previousTime = lastTick = 0;
    }

    function handleVisibility() {
        stopFrames();
        if (running && !document.hidden && !disposed) frame = requestAnimationFrame(tick);
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        running = false;
        stopFrames();
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', handleVisibility);
        controls.dispose();
        moon.dispose();
        const geometries = new Set();
        const materials = new Set();
        scene.traverse(object => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) materials.add(object.material);
            if (object.isInstancedMesh) object.dispose();
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        glowTexture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibility);
    resize();
    updateScenery(0);

    return {
        async prepare() {
            // A slow moon image must not hold the entire intro indefinitely.
            let timeout;
            await Promise.race([
                moon.ready,
                new Promise(resolve => { timeout = setTimeout(resolve, 2500); })
            ]);
            clearTimeout(timeout);
            if (disposed) return;
            if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
            else renderer.compile(scene, camera);
            prepared = true;
            render();
        },
        start() {
            if (running || disposed) return;
            running = true;
            controls.enabled = true;
            handleVisibility();
        },
        pause() {
            running = false;
            controls.enabled = false;
            stopFrames();
        },
        dispose
    };
}
