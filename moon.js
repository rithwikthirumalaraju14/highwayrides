import * as THREE from 'three';

export function createMoon(scene, renderer, onTextureReady) {
    const sunDirection = new THREE.Vector3(1, 0.12, 0).normalize();
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const material = new THREE.ShaderMaterial({
        uniforms: {
            moonMap: { value: null },
            mapReady: { value: false },
            sunDirection: { value: sunDirection },
            skyColor: { value: scene.background }
        },
        vertexShader,
        fragmentShader: `
            uniform sampler2D moonMap;
            uniform bool mapReady;
            uniform vec3 sunDirection;
            uniform vec3 skyColor;
            varying vec2 vUv;
            void main() {
                vec2 point = vUv * 2.0 - 1.0;
                float r2 = dot(point, point);
                float edgeWidth = max(fwidth(r2), 0.001);
                if (r2 > 1.0) discard;
                vec3 normal = vec3(point, sqrt(max(0.0, 1.0 - r2)));
                vec2 sphereUv = vec2(
                    0.5 + atan(normal.x, normal.z) / 6.28318530718,
                    0.5 + asin(clamp(normal.y, -1.0, 1.0)) / 3.14159265359
                );
                float surface = 0.45;
                if (mapReady) surface = texture2D(moonMap, sphereUv).r;
                float albedo = clamp(surface * 1.65, 0.04, 0.9);
                float sunlight = dot(normal, sunDirection);
                float illumination = pow(max(sunlight, 0.0), 0.4)
                    * smoothstep(-0.006, 0.012, sunlight);
                vec3 color = vec3(1.0, 0.8, 0.53) * albedo * illumination;
                color += skyColor + vec3(0.0005, 0.0006, 0.0009) * albedo;
                gl_FragColor = vec4(color, 1.0 - smoothstep(1.0 - edgeWidth, 1.0, r2));
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                // Scene backgrounds bypass tone mapping. Match that display
                // color on the dark half instead of painting a black disc.
                vec3 skyDisplay = linearToOutputTexel(vec4(skyColor, 1.0)).rgb;
                gl_FragColor.rgb = mix(skyDisplay, gl_FragColor.rgb,
                    smoothstep(-0.006, 0.012, sunlight));
            }
        `,
        extensions: { derivatives: true },
        transparent: true,
        depthWrite: false,
        fog: false
    });
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), material);
    moon.position.set(-6, 55, -280);
    moon.renderOrder = -1;
    scene.add(moon);

    const halo = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.ShaderMaterial({
        uniforms: { sunDirection: { value: sunDirection } },
        vertexShader,
        fragmentShader: `
            uniform vec3 sunDirection;
            varying vec2 vUv;
            void main() {
                vec2 uvPoint = vUv * 2.0 - 1.0;
                vec2 point = uvPoint * (44.0 / 30.0);
                float distanceToLight = max(length(point) - 1.0, -dot(point, sunDirection.xy));
                float glow = exp(-max(distanceToLight, 0.0) * 9.0) * 0.025;
                float edge = 1.0 - smoothstep(0.85, 1.0, length(uvPoint));
                gl_FragColor = vec4(1.0, 0.65, 0.3, glow * edge);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
    }));
    halo.position.copy(moon.position);
    halo.renderOrder = -2;
    scene.add(halo);

    let disposed = false;
    let settleTexture;
    const ready = new Promise(resolve => { settleTexture = resolve; });
    const texture = new THREE.TextureLoader().load(
        'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/moon_1024.jpg',
        () => {
            if (disposed) { texture.dispose(); return; }
            material.uniforms.mapReady.value = true;
            settleTexture();
            onTextureReady();
        },
        undefined,
        () => settleTexture()
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    material.uniforms.moonMap.value = texture;

    return {
        ready,
        update(camera) {
            moon.quaternion.copy(camera.quaternion);
            halo.quaternion.copy(camera.quaternion);
        },
        dispose() {
            disposed = true;
            settleTexture();
            texture.dispose();
        }
    };
}
