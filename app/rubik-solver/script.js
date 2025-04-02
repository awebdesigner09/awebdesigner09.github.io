//import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// OrbitControls is loaded via window object from HTML

// --- Configuration ---
const CUBE_SIZE = 3; // Currently only 3x3 is supported
const CUBIE_SIZE = 1;
const CUBIE_SPACING = 0.05; // Gap between cubies
const CUBE_DIM = CUBIE_SIZE + CUBIE_SPACING; // Distance between centers

// Colors (Standard Rubik's Colors)
const COLORS = {
    WHITE: 0xffffff,
    YELLOW: 0xffff00,
    BLUE: 0x0000ff,
    GREEN: 0x00ff00,
    RED: 0xff0000,
    ORANGE: 0xffa500,
    BLACK: 0x333333, // Inner color
};

// Face mapping (which face index corresponds to which color/normal)
// Order: Right (+X), Left (-X), Top (+Y), Bottom (-Y), Front (+Z), Back (-Z)
const FACE_COLORS = [COLORS.RED, COLORS.ORANGE, COLORS.WHITE, COLORS.YELLOW, COLORS.BLUE, COLORS.GREEN];
const FACE_NORMALS = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

// --- Global Variables ---
let scene, camera, renderer, controls;
let cubeGroup; // Group holding all cubies
let cubies = []; // Array of individual cubie meshes
let animationQueue = []; // Queue for sequential animations
let isAnimating = false; // Flag to prevent actions during animation
let isSolving = false; // Flag for automated solve mode
let isLearning = false; // Flag for learning mode
let currentLearnStep = 0;
let learnSequence = []; // Stores moves/instructions for learning

// State tracking for view rotation control
let isSpaceDown = false;

// UI Elements
const instructionText = document.getElementById('instructionText');
const scrambleBtn = document.getElementById('scrambleBtn');
const solveBtn = document.getElementById('solveBtn');
const learnBtn = document.getElementById('learnBtn');
const rendererContainer = document.getElementById('rendererContainer');

// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera
    camera = new THREE.PerspectiveCamera(75, rendererContainer.clientWidth / rendererContainer.clientHeight, 0.1, 1000);
    camera.position.set(CUBE_SIZE * 1.5, CUBE_SIZE * 1.5, CUBE_SIZE * 2.5); // Adjusted initial view
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
    rendererContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Controls (OrbitControls)
    controls = new window.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; // Usually don't pan Rubik's cubes
    controls.rotateSpeed = 0.8;

    // Cube Creation
    createCube(CUBE_SIZE);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    scrambleBtn.addEventListener('click', scrambleCube);
    solveBtn.addEventListener('click', startSolve);
    learnBtn.addEventListener('click', startLearn);

    // Keyboard listener for Space bar (view rotation alternative)
    window.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
            isSpaceDown = true;
            // Make OrbitControls primary when space is down
            controls.enabled = true;
        }
    });
    window.addEventListener('keyup', (event) => {
        if (event.code === 'Space') {
            isSpaceDown = false;
            // Re-enable default logic (if we had face rotation, it would switch here)
            controls.enabled = true; // Keep enabled for now
        }
    });

    // Mouse listener on renderer to disable OrbitControls if dragging on cube (needed for face rotation)
    // For now, just keep controls enabled unless space is pressed (or reverse logic if preferred)
    renderer.domElement.addEventListener('mousedown', () => {
        if (!isSpaceDown) {
            // If we were implementing face dragging, we'd disable OrbitControls here
            // controls.enabled = false;
        } else {
            controls.enabled = true;
        }
    });
    renderer.domElement.addEventListener('mouseup', () => {
         // Always re-enable controls on mouse up for simplicity here
        controls.enabled = true;
    });


    // Start Animation Loop
    animate();
}

// --- Cube Creation ---
function createCube(size) {
    if (cubeGroup) {
        scene.remove(cubeGroup); // Remove old cube if exists
    }
    cubeGroup = new THREE.Group();
    cubies = [];
    const offset = (size - 1) / 2; // To center the cube at (0,0,0)

    const cubieGeometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);

    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            for (let z = 0; z < size; z++) {
                // Don't create the inner cubie for size > 2
                if (size > 2 && x > 0 && x < size - 1 && y > 0 && y < size - 1 && z > 0 && z < size - 1) {
                    continue;
                }

                const materials = [];
                for (let i = 0; i < 6; i++) {
                    // Default to inner color
                    let faceColor = COLORS.BLACK;
                    // Assign face color if it's an outer face
                    if (x === size - 1 && i === 0) faceColor = FACE_COLORS[0]; // Right (+X) Red
                    if (x === 0 && i === 1) faceColor = FACE_COLORS[1]; // Left (-X) Orange
                    if (y === size - 1 && i === 2) faceColor = FACE_COLORS[2]; // Top (+Y) White
                    if (y === 0 && i === 3) faceColor = FACE_COLORS[3]; // Bottom (-Y) Yellow
                    if (z === size - 1 && i === 4) faceColor = FACE_COLORS[4]; // Front (+Z) Blue
                    if (z === 0 && i === 5) faceColor = FACE_COLORS[5]; // Back (-Z) Green

                    materials.push(new THREE.MeshStandardMaterial({
                        color: faceColor,
                        roughness: 0.7,
                        metalness: 0.1
                    }));
                }

                const cubie = new THREE.Mesh(cubieGeometry, materials);
                // Position based on index, adjusted by offset and spacing
                cubie.position.set(
                    (x - offset) * CUBE_DIM,
                    (y - offset) * CUBE_DIM,
                    (z - offset) * CUBE_DIM
                );

                // Store original position/orientation info if needed for complex logic later
                cubie.userData.originalPosition = cubie.position.clone();
                // Add a unique ID or initial logical position? Maybe not needed for simple rotation.

                cubeGroup.add(cubie);
                cubies.push(cubie);
            }
        }
    }
    scene.add(cubeGroup);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    TWEEN.update(); // Update animations
    controls.update(); // Update camera controls
    renderer.render(scene, camera);
}

// --- Event Handlers ---
function onWindowResize() {
    camera.aspect = rendererContainer.clientWidth / rendererContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(rendererContainer.clientWidth, rendererContainer.clientHeight);
}

// --- Cube Operations ---

// Find cubies belonging to a specific layer/slice
// axis: 'x', 'y', 'z'
// layerIndex: -1, 0, 1 (for 3x3 cube, relative to center)
function getCubiesInLayer(axis, layerIndex) {
    const layerCubies = [];
    const threshold = CUBE_DIM / 2; // Tolerance for position check

    cubies.forEach(cubie => {
        // Get world position relative to the cubeGroup center (which is 0,0,0)
        const position = cubie.position;
        if (Math.abs(position[axis] - layerIndex * CUBE_DIM) < threshold) {
            layerCubies.push(cubie);
        }
    });
    return layerCubies;
}

// Perform a rotation animation
// axis: 'x', 'y', 'z'
// layerIndex: -1, 0, 1 (relative to center)
// angle: Math.PI / 2 (clockwise) or -Math.PI / 2 (counter-clockwise) seen from positive axis
function rotateLayer(axis, layerIndex, angle, duration = 300) {
    if (isAnimating) {
        console.log("Animation in progress, queuing move.");
        // Simple queue: add function call to be executed later
        animationQueue.push(() => rotateLayer(axis, layerIndex, angle, duration));
        return;
    }
    isAnimating = true;
    setInstruction("...", 'pending'); // Indicate activity

    const layerCubies = getCubiesInLayer(axis, layerIndex);
    const pivot = new THREE.Group(); // Use a Group as a pivot
    pivot.position.set(0,0,0); // Pivot should be at world origin
    scene.add(pivot); // Add pivot to the scene temporarily

    // Attach cubies to the pivot
    layerCubies.forEach(cubie => {
       // Correctly reparent: transform world coords to pivot's local coords
       pivot.attach(cubie);
    });

    const targetRotation = {};
    targetRotation[axis] = pivot.rotation[axis] + angle;

    // Create Tween animation
    new TWEEN.Tween(pivot.rotation)
        .to(targetRotation, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onComplete(() => {
            // Detach cubies from pivot and reattach to cubeGroup
            // Important: Apply world matrix updates correctly
             layerCubies.forEach(cubie => {
                // Make sure matrix world is up-to-date before detaching
                cubie.updateMatrixWorld();
                // Reattach to the main cube group
                cubeGroup.attach(cubie);
            });

            // Remove the temporary pivot
            scene.remove(pivot);

            // Round positions and rotations to avoid floating point errors accumulating
            snapCubiesToGrid();

            // Animation finished
            isAnimating = false;
            processAnimationQueue(); // Process next animation if any

            // If in learning mode, check if the step is complete
             if (isLearning) {
                 checkLearnStep();
             } else if (!isSolving && animationQueue.length === 0) {
                 setInstruction("Ready."); // Reset instruction if idle
             }
        })
        .start();
}

// Helper to process the animation queue
function processAnimationQueue() {
    if (!isAnimating && animationQueue.length > 0) {
        const nextAction = animationQueue.shift();
        nextAction(); // Execute the queued rotation function
    } else if (!isAnimating && !isSolving && !isLearning) {
         setInstruction("Ready.");
    }
}

// Helper to snap cubies to the nearest grid position/rotation after animation
function snapCubiesToGrid() {
    const axes = ['x', 'y', 'z'];
    const angleSnap = Math.PI / 2;

    cubies.forEach(cubie => {
        axes.forEach(axis => {
            // Snap position
            cubie.position[axis] = Math.round(cubie.position[axis] / CUBE_DIM) * CUBE_DIM;
            // Snap rotation (Euler angles)
            cubie.rotation[axis] = Math.round(cubie.rotation[axis] / angleSnap) * angleSnap;
        });
         // Also crucial to update quaternion if manipulating rotation directly
         cubie.updateMatrixWorld(); // Ensure matrix is updated after snapping
    });
}


// --- Button Actions ---

function scrambleCube() {
    if (isAnimating || isSolving || isLearning) return; // Prevent interruption
    console.log("Scrambling...");
    setInstruction("Scrambling...", "pending");
    isAnimating = true; // Block input during scramble sequence

    const moves = [];
    const axes = ['x', 'y', 'z'];
    const layers = [-1, 0, 1]; // For 3x3
    const angles = [Math.PI / 2, -Math.PI / 2];
    const numScrambleMoves = 20; // Number of random moves

    for (let i = 0; i < numScrambleMoves; i++) {
        const axis = axes[Math.floor(Math.random() * axes.length)];
        const layer = layers[Math.floor(Math.random() * layers.length)];
        // Avoid rotating the center layer (layer 0) if it doesn't change colors (like in 3x3)
        if (CUBE_SIZE === 3 && layer === 0 && (axis === 'x' || axis === 'z')) continue;
        if (CUBE_SIZE === 3 && layer === 0 && axis === 'y') continue; // Center layer Y also often ignored unless whole cube rotation

        const angle = angles[Math.floor(Math.random() * angles.length)];
        // Add the move to the queue directly
        animationQueue.push(() => rotateLayer(axis, layer, angle, 150)); // Faster scramble animation
    }

     // Add a final action to reset the state after scrambling
     animationQueue.push(() => {
        isAnimating = false;
        setInstruction("Scramble complete. Ready.");
        console.log("Scramble complete.");
     });

     // Start processing the queue
     processAnimationQueue();
}

function startSolve() {
    if (isAnimating || isSolving || isLearning) return;
    console.log("Starting Solve...");
    isSolving = true;
    // Generate the solve sequence (simplified layer-by-layer)
    // This is complex. We'll simulate just one step: Rotating Front Face Clockwise
    // A real implementation needs a solving algorithm based on current state.
    const solveSequence = [
        { axis: 'z', layer: 1, angle: Math.PI / 2, duration: 500, text: "Step 1: Rotate Front Face (Blue) Clockwise" },
        // ... Add many more steps generated by a real algorithm
        { axis: 'y', layer: 1, angle: -Math.PI / 2, duration: 500, text: "Step 2: Rotate Top Face (White) Counter-Clockwise" },
        // Example: A simple R U R' U' sequence (Right= +X, layer 1; Up= +Y, layer 1)
        { axis: 'x', layer: 1, angle: Math.PI / 2, duration: 500, text: "Step 3: R (Right face clockwise)" },
        { axis: 'y', layer: 1, angle: Math.PI / 2, duration: 500, text: "Step 4: U (Up face clockwise)" },
        { axis: 'x', layer: 1, angle: -Math.PI / 2, duration: 500, text: "Step 5: R' (Right face counter-clockwise)" },
        { axis: 'y', layer: 1, angle: -Math.PI / 2, duration: 500, text: "Step 6: U' (Up face counter-clockwise)" },
    ];

     // Clear existing queue and add solve steps
    animationQueue = [];
    solveSequence.forEach(step => {
        animationQueue.push(() => {
             setInstruction(step.text, 'pending');
             rotateLayer(step.axis, step.layer, step.angle, step.duration);
        });
    });

     // Add final step to mark solving as complete
    animationQueue.push(() => {
        isSolving = false;
        setInstruction("Automated solve steps finished (Example).");
        console.log("Solve sequence finished.");
    });

     // Start the solve process
     processAnimationQueue();
}

function startLearn() {
    if (isAnimating || isSolving || isLearning) return;
    console.log("Starting Learn Mode...");
    isLearning = true;
    currentLearnStep = 0;

    // Define the learning sequence (mirroring the simple solve example)
    // A real sequence would be generated based on the scrambled state
    learnSequence = [
        {
            instruction: "Perform: Front Face (Blue) Clockwise (F). Goal: Blue face rotated.",
            check: () => checkRotationComplete('z', 1, Math.PI / 2) // Check if the front face is rotated 90 deg CW
        },
        {
            instruction: "Perform: Top Face (White) Counter-Clockwise (U'). Goal: White face rotated.",
            check: () => checkRotationComplete('y', 1, -Math.PI / 2) // Check state after *second* move relative to start or previous step
        },
         {
            instruction: "Perform: Right Face Clockwise (R). Goal: Apply R.",
            check: () => checkRotationComplete('x', 1, Math.PI / 2) // This checking is simplistic
        },
        // Add more steps corresponding to a layer-by-layer method
    ];

    displayLearnInstruction();
    // Enable user interaction (face clicking/dragging - NOT implemented here)
    // User needs to perform the move manually. The check happens after animations complete.
    setInstruction("Learning Mode Active. Follow instructions.", "pending");
    // For this example, since direct face rotation isn't implemented,
    // learning mode won't be truly interactive. We'll just show text.
    // To make it work, you'd need mouse face rotation + the checkLearnStep call.

     // Simulate progressing for demonstration (remove in real implementation)
     // setTimeout(simulateUserCompletesStep, 3000); // Simulate user does step 1
}

function displayLearnInstruction() {
    if (currentLearnStep < learnSequence.length) {
        const step = learnSequence[currentLearnStep];
        setInstruction(`Learn Step ${currentLearnStep + 1}: ${step.instruction}`, 'pending');
    } else {
        setInstruction("Learning complete!", 'correct');
        isLearning = false;
    }
}

function checkLearnStep() {
    if (!isLearning || currentLearnStep >= learnSequence.length) return;

    const step = learnSequence[currentLearnStep];
    if (step.check()) {
        console.log(`Learn Step ${currentLearnStep + 1} correct!`);
        setInstruction(`Step ${currentLearnStep + 1} Correct!`, 'correct');
        currentLearnStep++;
        // Display next instruction after a short delay
        setTimeout(displayLearnInstruction, 1500);
    } else {
        console.log(`Learn Step ${currentLearnStep + 1} not completed correctly yet.`);
        // Keep showing the current instruction, maybe with a hint?
         setInstruction(`Learn Step ${currentLearnStep + 1}: ${step.instruction} (Try again)`, 'pending');
    }
}

// --- Helper Functions ---

function setInstruction(text, status = 'default') { // status: 'default', 'correct', 'pending'
    instructionText.textContent = text;
    instructionText.className = status; // Apply CSS class
}

// Example Check Function (VERY SIMPLISTIC)
// This needs to be much more robust, checking specific piece positions/orientations
// relative to the *goal* state for that step, not just if *a* rotation happened.
function checkRotationComplete(axis, layer, angle) {
    // This basic check assumes the user performs EXACTLY the required single rotation.
    // It doesn't verify the cube state meets the goal of a specific solving phase.
    // A real check needs to analyze colors of specific cubies.
    console.warn("checkRotationComplete is a placeholder. Needs proper state checking.");
    // Placeholder: returns true to allow learn mode to progress for demo.
    return true;
}


// --- Start Application ---
init();