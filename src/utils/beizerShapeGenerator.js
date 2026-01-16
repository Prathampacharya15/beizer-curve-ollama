import * as THREE from "three";

/**
 * Shape generator for Bezier editor
 * - NO duplicate anchors
 * - Correct Bézier math
 * - Predictable scaling
 * - PPT/Figma-style geometry
 */

const KAPPA = 0.5522847498307936; // Exact Bezier circle constant

// ----------------------------
// Helpers
// ----------------------------

const makeLinearControls = (anchors) => {
    const controls = [];

    for (let i = 0; i < anchors.length; i++) {
        const A = anchors[i];
        const B = anchors[(i + 1) % anchors.length];

        controls.push({
            cp1: A.clone().lerp(B, 1 / 3),
            cp2: A.clone().lerp(B, 2 / 3),
        });
    }

    return controls;
};

// ----------------------------
// Shape Generator
// ----------------------------

export const generateShapeData = (type, size = 1) => {
    const anchors = [];
    let controls = [];
    let closed = true;

    switch (type) {
        // ----------------------------
        // RECTANGLE
        // ----------------------------
        case "rectangle": {
            const w = size * 2;
            const h = size * 1.2;

            anchors.push(
                new THREE.Vector3(-w / 2, h / 2, 0),
                new THREE.Vector3(w / 2, h / 2, 0),
                new THREE.Vector3(w / 2, -h / 2, 0),
                new THREE.Vector3(-w / 2, -h / 2, 0)
            );

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // CIRCLE (Perfect Bezier)
        // ----------------------------
        case "circle": {
            const r = size;
            const k = r * KAPPA;

            anchors.push(
                new THREE.Vector3(0, r, 0),
                new THREE.Vector3(r, 0, 0),
                new THREE.Vector3(0, -r, 0),
                new THREE.Vector3(-r, 0, 0)
            );

            controls.push(
                { cp1: new THREE.Vector3(k, r, 0), cp2: new THREE.Vector3(r, k, 0) },
                { cp1: new THREE.Vector3(r, -k, 0), cp2: new THREE.Vector3(k, -r, 0) },
                { cp1: new THREE.Vector3(-k, -r, 0), cp2: new THREE.Vector3(-r, -k, 0) },
                { cp1: new THREE.Vector3(-r, k, 0), cp2: new THREE.Vector3(-k, r, 0) }
            );
            break;
        }

        // ----------------------------
        // TRIANGLE (Isosceles)
        // ----------------------------
        case "triangle": {
            anchors.push(
                new THREE.Vector3(0, size * 1.3, 0),
                new THREE.Vector3(size, -size, 0),
                new THREE.Vector3(-size, -size, 0)
            );

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // DIAMOND (Flowchart Decision)
        // ----------------------------
        case "diamond": {
            const d = size * 1.4;

            anchors.push(
                new THREE.Vector3(0, d, 0),
                new THREE.Vector3(d, 0, 0),
                new THREE.Vector3(0, -d, 0),
                new THREE.Vector3(-d, 0, 0)
            );

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // HEXAGON
        // ----------------------------
        case "hexagon": {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
                anchors.push(
                    new THREE.Vector3(
                        Math.cos(angle) * size,
                        Math.sin(angle) * size,
                        0
                    )
                );
            }

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // STAR (5-point)
        // ----------------------------
        case "star": {
            const outer = size;
            const inner = size * 0.45;
            const spikes = 5;

            for (let i = 0; i < spikes * 2; i++) {
                const r = i % 2 === 0 ? outer : inner;
                const angle =
                    (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;

                anchors.push(
                    new THREE.Vector3(
                        Math.cos(angle) * r,
                        Math.sin(angle) * r,
                        0
                    )
                );
            }

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // RIGHT ARROW (Block Arrow)
        // ----------------------------
        case "right_arrow": {
            const w = size * 2;
            const h = size;
            const t = size * 0.6;

            anchors.push(
                new THREE.Vector3(-w, t, 0),
                new THREE.Vector3(0, t, 0),
                new THREE.Vector3(0, h, 0),
                new THREE.Vector3(w, 0, 0),
                new THREE.Vector3(0, -h, 0),
                new THREE.Vector3(0, -t, 0),
                new THREE.Vector3(-w, -t, 0)
            );

            controls = makeLinearControls(anchors);
            break;
        }

        // ----------------------------
        // DEFAULT → LINE
        // ----------------------------
        default: {
            anchors.push(
                new THREE.Vector3(-size, 0, 0),
                new THREE.Vector3(size, 0, 0)
            );

            controls = makeLinearControls(anchors);
            closed = false;
            break;
        }
    }

    return { anchors, controls, closed };
};
