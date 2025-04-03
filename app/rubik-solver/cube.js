//cube.js
// 
// // Basic Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); // Match body background

const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('rubiks-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

// --- State Tracking ---
let currentInternalCubeState = null; // Will be initialized as new min2phase.CubieCube()
let isSolverInitialized = false; 

const faceNames = ['U', 'R', 'F', 'D', 'L', 'B']; // Map index to face name
// const colorMapThreeToChar = {}; // Will populate this


// Adjust renderer size to fit container
function resizeRenderer() {
    const { clientWidth: width, clientHeight: height } = canvasContainer;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);

const camera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
camera.position.set(4, 4, 6); // Initial camera position
camera.lookAt(scene.position);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Orbit Controls (for view rotation)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = false; // Keep panning relative to origin
controls.enableRotate = false; // Initially disable rotation, enable with Spacebar
controls.enablePan = false; // Disable panning for simplicity

// --- Constants ---
const CUBE_SIZE = 3; // 3x3x3
const CUBIE_SIZE = 1;
const CUBIE_SPACING = 0.05; // Gap between cubies
const TOTAL_CUBIE_SIZE = CUBIE_SIZE + CUBIE_SPACING;
const CUBE_CENTER_OFFSET = (CUBE_SIZE - 1) * TOTAL_CUBIE_SIZE / 2;

// Colors (Standard Rubik's Colors)
const COLORS = {
    white:  0xffffff,
    yellow: 0xffff00,
    blue:   0x0000ff,
    green:  0x00ff00,
    red:    0xff0000,
    orange: 0xffa500,
    black:  0x000000 // Inner color
};

const FACE_MATERIALS = {
    // Order: +X (Right), -X (Left), +Y (Up), -Y (Down), +Z (Front), -Z (Back)
    right:  new THREE.MeshStandardMaterial({ color: COLORS.red }),    // R
    left:   new THREE.MeshStandardMaterial({ color: COLORS.orange }), // L
    up:     new THREE.MeshStandardMaterial({ color: COLORS.white }),  // U
    down:   new THREE.MeshStandardMaterial({ color: COLORS.yellow }), // D
    front:  new THREE.MeshStandardMaterial({ color: COLORS.blue }),   // F
    back:   new THREE.MeshStandardMaterial({ color: COLORS.green }),  // B
    inner:  new THREE.MeshStandardMaterial({ color: COLORS.black })   // Inner faces
};

// --- Global State ---
let cube = new THREE.Group(); // Holds all cubies
let cubies = []; // Array to store individual cubie objects
let isAnimating = false; // Prevent actions during animation
let isDragging = false;
let isRotatingView = false;
let dragStartPoint = null;
let currentIntersect = null;
let isLearnMode = false;
let solveSteps = [];
let currentSolveStepIndex = -1;
let learnStepExpectedMove = null;

// --- UI Elements ---
const scrambleButton = document.getElementById('scramble-button');
const solveButton = document.getElementById('solve-button');
const learnButton = document.getElementById('learn-button');
const resetViewButton = document.getElementById('reset-view-button');
const instructionList = document.getElementById('instruction-list');
const statusText = document.getElementById('status-text');

// --- Helper Functions ---

function getCubieMaterials(x, y, z) {
    const materials = [];
    // Order: +X, -X, +Y, -Y, +Z, -Z
    materials.push((x === CUBE_SIZE - 1) ? FACE_MATERIALS.right : FACE_MATERIALS.inner); // Right (+X)
    materials.push((x === 0) ? FACE_MATERIALS.left : FACE_MATERIALS.inner);               // Left (-X)
    materials.push((y === CUBE_SIZE - 1) ? FACE_MATERIALS.up : FACE_MATERIALS.inner);     // Up (+Y)
    materials.push((y === 0) ? FACE_MATERIALS.down : FACE_MATERIALS.inner);               // Down (-Y)
    materials.push((z === CUBE_SIZE - 1) ? FACE_MATERIALS.front : FACE_MATERIALS.inner);  // Front (+Z)
    materials.push((z === 0) ? FACE_MATERIALS.back : FACE_MATERIALS.inner);               // Back (-Z)
    return materials;
}

function createCubie(x, y, z) {
    const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
    const materials = getCubieMaterials(x, y, z);
    const cubie = new THREE.Mesh(geometry, materials);

    // Calculate position centered around the origin
    cubie.position.set(
        (x * TOTAL_CUBIE_SIZE) - CUBE_CENTER_OFFSET,
        (y * TOTAL_CUBIE_SIZE) - CUBE_CENTER_OFFSET,
        (z * TOTAL_CUBIE_SIZE) - CUBE_CENTER_OFFSET
    );

    // Store original logical position for layer selection
    cubie.userData.logicalPosition = { x, y, z };
    cubie.userData.objectType = 'cubie'; // For raycasting identification

    return cubie;
}

function createCube() {
    scene.remove(cube);
    cube = new THREE.Group();
    cubies = [];
    for (let x = 0; x < CUBE_SIZE; x++) {
        for (let y = 0; y < CUBE_SIZE; y++) {
            for (let z = 0; z < CUBE_SIZE; z++) {
                if (x > 0 && x < CUBE_SIZE - 1 && y > 0 && y < CUBE_SIZE - 1 && z > 0 && z < CUBE_SIZE - 1) continue;
                const cubie = createCubie(x, y, z);
                cubies.push(cubie);
                cube.add(cubie);
            }
        }
    }
    // Initialize internal state - check if CubieCube is a function/constructor
    if (isSolverInitialized && typeof min2phase !== 'undefined' && typeof min2phase.CubieCube === 'function') {
        currentInternalCubeState = new min2phase.CubieCube(); // Creates a solved cube
        console.log("Internal cube state initialized/reset.");
    } else {
        console.warn("Solver not ready or CubieCube not found when trying to initialize internal state in createCube.");
        // We might be called by reset *before* init finishes, so don't error, just leave state null.
        currentInternalCubeState = null;
    }
    scene.add(cube);
}


function updateStatus(text) {
    statusText.textContent = text;
    console.log("Status:", text); // Log to console as well
}

function updateInstructions(stepsArray = [], currentIdx = -1, completedMask = null) {
    instructionList.innerHTML = ''; // Clear previous
    if (stepsArray.length === 0 && !isLearnMode) {
         instructionList.innerHTML = '<p>Click and drag faces to rotate them.</p><p>Hold SPACEBAR and drag mouse to rotate the view.</p>';
         return;
    }
     if (stepsArray.length === 0 && isLearnMode) {
         instructionList.innerHTML = '<p>Cube scrambled. Follow the steps below.</p>';
         // Add initial instructions if needed for learn mode start
     }


    stepsArray.forEach((step, index) => {
        const p = document.createElement('p');
        p.textContent = `${index + 1}. ${step.description || step.move}`; // Use description if available
        p.classList.add('step');
        if (index === currentIdx) {
            p.classList.add('current');
        }
        // Check completion status using index (simpler than bitmask here)
        if (completedMask && completedMask[index]) {
             p.classList.add('completed');
        }
        instructionList.appendChild(p);
    });

     // Scroll the current instruction into view
    const currentElement = instructionList.querySelector('.step.current');
    if (currentElement) {
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}


// --- Rotation Logic ---

const AXIS = { X: 'x', Y: 'y', Z: 'z' };

// Get cubies belonging to a specific layer
function getLayerCubies(axis, layerIndex) {
    const layerCubies = [];
    const epsilon = 0.1; // Tolerance for floating point comparisons

    cubies.forEach(cubie => {
        // Need world position because cubies might be attached to pivot temporarily
        const worldPos = new THREE.Vector3();
        cubie.getWorldPosition(worldPos);

        // Convert world position back to approximate logical layer index
        let posAlongAxis;
        switch (axis) {
            case AXIS.X: posAlongAxis = (worldPos.x + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE; break;
            case AXIS.Y: posAlongAxis = (worldPos.y + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE; break;
            case AXIS.Z: posAlongAxis = (worldPos.z + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE; break;
        }

        // Check if the cubie is close enough to the target layer index
        if (Math.abs(Math.round(posAlongAxis) - layerIndex) < epsilon) {
            layerCubies.push(cubie);
        }
    });
    return layerCubies;
}


// Animate the rotation of a layer
function rotateLayer(axis, layerIndex, angle, duration = 300, onComplete = null) {
    if (isAnimating) return;
    isAnimating = true;
    updateStatus(`Rotating ${axis.toUpperCase()} layer ${layerIndex}...`);
    disableControls();

    const layer = getLayerCubies(axis, layerIndex);
    if (layer.length === 0) {
        console.warn(`No cubies found for layer ${axis}:${layerIndex}`);
        isAnimating = false;
        enableControls();
        if(onComplete) onComplete();
        return;
    }

    const pivot = new THREE.Group(); // Temporary group for rotation
    scene.add(pivot);

    // Move layer cubies from main cube group to pivot group
    layer.forEach(cubie => {
        // Convert world position to pivot's local space before attaching
        pivot.attach(cubie);
    });

    const targetRotation = { value: 0 };
    const tween = new TWEEN.Tween(targetRotation)
        .to({ value: angle }, duration)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
            if (axis === AXIS.X) pivot.rotation.x = targetRotation.value;
            if (axis === AXIS.Y) pivot.rotation.y = targetRotation.value;
            if (axis === AXIS.Z) pivot.rotation.z = targetRotation.value;
        })
        .onComplete(() => {
            // After rotation, move cubies back to the main cube group
            // Important: Update cubie's world matrix first
             pivot.updateMatrixWorld();
             layer.forEach(cubie => {
                // Get world matrix, apply it to cubie, remove from pivot, add back to scene's cube group
                scene.attach(cubie); // This preserves world transforms
                // Snap rotation to nearest 90 degrees (PI/2 radians)
                cubie.rotation.x = Math.round(cubie.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
                cubie.rotation.y = Math.round(cubie.rotation.y / (Math.PI / 2)) * (Math.PI / 2);
                cubie.rotation.z = Math.round(cubie.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
                
                // Optional: Snap position (often less critical if spacing > 0, but can help)
                // We need to snap the WORLD position, then potentially convert back if parent isn't scene origin
                // Or simpler: round local position if parent is scene origin. Let's try rounding local:
                cubie.position.x = Math.round(cubie.position.x / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE;
                cubie.position.y = Math.round(cubie.position.y / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE;
                cubie.position.z = Math.round(cubie.position.z / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE;
                // Refined Position Snapping (considering the offset):
                cubie.position.x = Math.round((cubie.position.x + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE - CUBE_CENTER_OFFSET;
                cubie.position.y = Math.round((cubie.position.y + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE - CUBE_CENTER_OFFSET;
                cubie.position.z = Math.round((cubie.position.z + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE) * TOTAL_CUBIE_SIZE - CUBE_CENTER_OFFSET;
                // ^^ Let's try the simple rounding first. ^^
            
            });
             scene.remove(pivot); // Clean up the temporary pivot

            isAnimating = false;
            enableControls();
            updateStatus("Ready");
            if (onComplete) {
                onComplete();
            }
        })
        .start();
}

// --- Move Notation Mapping ---
// Map standard notation (U, R, F, D, L, B, U', R2 etc.) to rotation parameters
const moveMap = {
    'U': { axis: AXIS.Y, layer: CUBE_SIZE - 1, angle: -Math.PI / 2 },
    'U\'': { axis: AXIS.Y, layer: CUBE_SIZE - 1, angle: Math.PI / 2 },
    'U2': { axis: AXIS.Y, layer: CUBE_SIZE - 1, angle: -Math.PI },
    'D': { axis: AXIS.Y, layer: 0, angle: Math.PI / 2 },
    'D\'': { axis: AXIS.Y, layer: 0, angle: -Math.PI / 2 },
    'D2': { axis: AXIS.Y, layer: 0, angle: Math.PI },
    'R': { axis: AXIS.X, layer: CUBE_SIZE - 1, angle: -Math.PI / 2 },
    'R\'': { axis: AXIS.X, layer: CUBE_SIZE - 1, angle: Math.PI / 2 },
    'R2': { axis: AXIS.X, layer: CUBE_SIZE - 1, angle: -Math.PI },
    'L': { axis: AXIS.X, layer: 0, angle: Math.PI / 2 },
    'L\'': { axis: AXIS.X, layer: 0, angle: -Math.PI / 2 },
    'L2': { axis: AXIS.X, layer: 0, angle: Math.PI },
    'F': { axis: AXIS.Z, layer: CUBE_SIZE - 1, angle: -Math.PI / 2 },
    'F\'': { axis: AXIS.Z, layer: CUBE_SIZE - 1, angle: Math.PI / 2 },
    'F2': { axis: AXIS.Z, layer: CUBE_SIZE - 1, angle: -Math.PI },
    'B': { axis: AXIS.Z, layer: 0, angle: Math.PI / 2 },
    'B\'': { axis: AXIS.Z, layer: 0, angle: -Math.PI / 2 },
    'B2': { axis: AXIS.Z, layer: 0, angle: Math.PI },
    // Add middle layer slices if needed (M, E, S) - more complex layer selection
};

function performMove(axis, layer, angle, moveNotation, calledFrom = 'unknown') {
    // --- >>> ADD THIS GUARD CLAUSE <<< ---
    if (typeof axis === 'undefined') {
        console.error(`performMove called with undefined axis! Layer: ${layer}, Angle: ${angle}, Notation: ${moveNotation}, From: ${calledFrom}`);
        // Prevent further execution to avoid the ReferenceError
        return Promise.reject("performMove called with undefined axis");
    }
    // --- >>> END GUARD CLAUSE <<< ---


    if (isAnimating) return Promise.reject("Animation in progress");
    console.log(`performMove called for: Axis ${axis}, Layer ${layer}, Angle ${angle.toFixed(2)}, Notation '${moveNotation}', From ${calledFrom}`);


    // --- >>> Update the INTERNAL state using AXIS/LAYER/ANGLE <<< ---
    let internalStateUpdated = false;
    if (currentInternalCubeState && isSolverInitialized && typeof min2phase !== 'undefined' && min2phase.moveCube && typeof min2phase.CubieCube === 'function') {
        const direction = angle / (Math.PI / 2); // Determine direction (-1, 1, or 2 for 180)
        let moveCode = -1;

        // Use === strict equality for axis comparison
        if (Math.abs(Math.round(direction)) === 2) { // Handle double moves (180 degrees)
             const baseCode = getInternalMoveCode(axis, layer, Math.sign(direction));
             if (baseCode !== -1) {
                 const tempCube = new min2phase.CubieCube();
                 const moveCubeEntry = min2phase.moveCube[baseCode];
                 if (moveCubeEntry){
                    min2phase.CubieCube_CornMult(currentInternalCubeState, moveCubeEntry, tempCube);
                    min2phase.CubieCube_EdgeMult(currentInternalCubeState, moveCubeEntry, tempCube);
                    min2phase.CubieCube_CornMult(tempCube, moveCubeEntry, currentInternalCubeState);
                    min2phase.CubieCube_EdgeMult(tempCube, moveCubeEntry, currentInternalCubeState);
                    internalStateUpdated = true;
                    console.log(`Internal state updated by double move: ${moveNotation}`);
                 } else {
                     console.warn(`Internal moveCube entry missing for base code ${baseCode}`);
                 }
             } else {
                 console.warn(`Could not determine base move code for double move: ${moveNotation}`);
             }
        } else { // Single move (90 degrees)
            moveCode = getInternalMoveCode(axis, layer, Math.sign(direction));
            if (moveCode !== -1 && min2phase.moveCube[moveCode]) {
                const tempCube = new min2phase.CubieCube();
                min2phase.CubieCube_CornMult(currentInternalCubeState, min2phase.moveCube[moveCode], tempCube);
                min2phase.CubieCube_EdgeMult(currentInternalCubeState, min2phase.moveCube[moveCode], tempCube);
                currentInternalCubeState.init(tempCube.ca, tempCube.ea);
                internalStateUpdated = true;
                // console.log(`Internal state updated by move: ${moveNotation} (Code: ${moveCode})`);
            } else {
                 console.warn(`Internal state NOT updated. Move code ${moveCode} not found or invalid for: ${moveNotation}`);
            }
        }
    } else {
        console.error("Cannot update internal state: Internal state object or required solver library parts missing/invalid.");
    }
     console.log(`Internal state update status for '${moveNotation}': ${internalStateUpdated}`);
    // --- End internal state update ---


    // --- Visual Animation (Use axis, layer, angle directly) ---
    return new Promise((resolve) => {
         const duration = Math.abs(Math.round(angle / (Math.PI/2))) === 2 ? 400 : 300; // Longer for 180?
         rotateLayer(axis, layer, angle, duration, resolve); // << Error might originate from here if axis is invalid for rotateLayer
     });
}

// --- Scramble, Solve, Learn ---
function scrambleCube() {
    if (isAnimating) return;

    // --- Check if internal state is ready ---
    if (!isSolverInitialized || !currentInternalCubeState) {
        console.error("Cannot scramble: Solver or internal state not ready.");
        updateStatus("Error: Cannot scramble now.");
        // Optionally, try to re-initialize if null:
        // if (!currentInternalCubeState && isSolverInitialized) {
        //     console.log("Attempting to reinitialize internal state before scramble.");
        //     currentInternalCubeState = new min2phase.CubieCube();
        // } else {
        //     return; // Still cannot proceed
        // }
         return; // Prevent scrambling if state isn't ready
    }
    // --- End check ---

    resetState(); // Clears UI/learn state etc.

    const baseMoves = ["U", "R", "F", "D", "L", "B"];
    const scrambleSequence = []; // For visual animation
    const scrambleLength = 20;

    updateStatus("Scrambling...");
    disableControls();

    // --- >>> Apply scramble moves directly to the CURRENT internal state <<< ---
    const tempCube = new min2phase.CubieCube(); // Helper for multiplication
    console.log("Applying scramble to *current* internal state...");

    for (let i = 0; i < scrambleLength; i++) {
        const base = baseMoves[Math.floor(Math.random() * baseMoves.length)];
        const modIndex = Math.floor(Math.random() * 3); // 0: normal, 1: 2, 2: prime
        let move = ""; // This is the move string for internal lookup and visual sequence

        // Ensure move format matches min2phase.move2str (e.g., "U " for single U)
        if (modIndex === 0) move = base + " "; // Add space for single moves if required by move2str format
        else if (modIndex === 1) move = base + "2";
        else move = base + "'";

        scrambleSequence.push(move); // Store for visual animation

        const moveCode = min2phase.move2str.indexOf(move);
         if (moveCode !== -1 && min2phase.moveCube[moveCode]) {
            // Apply move directly to currentInternalCubeState using the tempCube helper
            min2phase.CubieCube.CornMult(currentInternalCubeState, min2phase.moveCube[moveCode], tempCube);
            min2phase.CubieCube.EdgeMult(currentInternalCubeState, min2phase.moveCube[moveCode], tempCube);
            currentInternalCubeState.init(tempCube.ca, tempCube.ea); // Update currentInternalCubeState
        } else {
             console.warn(`Scramble move '${move}' (code: ${moveCode}) not found in min2phase.move2str or moveCube - Skipping internal update for this move.`);
        }
    }
    // --- No need to reassign currentInternalCubeState, it was updated in place ---
    console.log("Internal state updated after scramble.");
    console.log("Final Scrambled Facelet State (from internal):", currentInternalCubeState.toFaceCube());
    console.log("Visual Scramble Sequence:", scrambleSequence.join(' '));
    // --- End internal state update ---


    // Apply scramble moves visually (starting from the current visual state)
    let currentMove = 0;
    function applyNextVisualMove() {
        if (currentMove < scrambleSequence.length) {
            const move = scrambleSequence[currentMove++]; // Get the correctly formatted move
            const trimmedMove = move.trim(); // Trim for visual lookup
            const visualParams = moveMap[trimmedMove];

            if (!visualParams) {
                console.warn(`Visual params not found for move: ${trimmedMove}`);
                applyNextVisualMove(); // Skip if visual unknown
                return;
            }

            const duration = 75; // Slightly faster scramble animation

             // Handle double moves visually correctly
             if (trimmedMove.endsWith('2')) {
                 // Find the base move (e.g., 'R' from 'R2')
                 const singleMoveNotation = trimmedMove.substring(0, 1);
                 const singleParams = moveMap[singleMoveNotation];
                 if (singleParams) {
                     // Perform the first 90-degree turn
                     rotateLayer(singleParams.axis, singleParams.layer, singleParams.angle, duration / 2, () => {
                         // Perform the second 90-degree turn upon completion of the first
                         rotateLayer(singleParams.axis, singleParams.layer, singleParams.angle, duration / 2, applyNextVisualMove);
                     });
                 } else {
                     console.warn(`Cannot visually process double move for base ${singleMoveNotation}`);
                     applyNextVisualMove(); // Skip if base move unknown
                 }
             } else {
                 // Single or prime move
                 rotateLayer(visualParams.axis, visualParams.layer, visualParams.angle, duration, applyNextVisualMove);
             }
        } else {
             updateStatus("Scrambled. Ready.");
             enableControls();
             console.log("Visual scramble complete.");
        }
    }
    applyNextVisualMove(); // Start applying the visual scramble
}


// Get the solution for the current cube state
function getSolutionForCurrentState() {

    // 1. Check if solver is ready
    if (!isSolverInitialized) {
        console.error("Solver not initialized yet.");
        updateStatus("Error: Solver is still initializing.");
        return null;
    }

    // 2. Check if internal state object exists
    if (!currentInternalCubeState) {
         console.error("Internal cube state is not initialized.");
         updateStatus("Error: Cube state missing.");
         return null;
    }

    // 3. --- >>> Generate facelet string FROM internal state <<< ---
    let faceletString;
    try {
        faceletString = currentInternalCubeState.toFaceCube();
        console.log("Requesting solution. Generated facelet string:", faceletString);
    } catch (e) {
        console.error("Error generating facelet string from internal state:", e);
        updateStatus("Error: Failed to read cube state.");
        return null;
    }

    // 4. Check if already solved (using the generated string)
    const SOLVED_STRING_FOR_CHECK = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"; // Define locally if needed
    if (faceletString === SOLVED_STRING_FOR_CHECK) {
        console.log("Cube is already solved logically.");
        updateStatus("Cube is already solved.");
        return []; // No moves needed
    }

    // 5. Proceed with calling the solver
    try {
        if (typeof min2phase === 'undefined' || typeof min2phase.solve !== 'function') {
            console.error("min2phase solver library not found or not loaded correctly!");
            updateStatus("Error: Solver library missing.");
            return null;
        }

        updateStatus("Calculating solution (can take a few seconds)...");
        console.log("Sending generated state to min2phase solver:", faceletString);
        disableControls();

        let solutionString = "";
        try {
            solutionString = min2phase.solve(faceletString); // Pass the generated string
        } catch (e) {
             console.error("Solver threw an error during execution:", e);
             solutionString = "Error: Solver crashed";
        }

        console.log("min2phase solver returned:", solutionString);
        enableControls();

        // Process the result
        if (!solutionString || typeof solutionString !== 'string' || solutionString.toLowerCase().includes("error")) {
             console.error("Solver returned an error or invalid result:", solutionString);
             let errorMsg = solutionString ? solutionString.replace(/Error\s*\d*:/i, '').trim() : "Solver failed";
             errorMsg = errorMsg.replace(/^Error\s*\d+$/, 'Invalid cube state or solver issue');
             updateStatus("Error: " + errorMsg);
             // No need to log faceletString here as errors should be less frequent now
             return null;
        }

        if (solutionString.trim() === "") {
             console.warn("Solver returned empty string for non-solved state:", faceletString);
             updateStatus("Solver returned unexpected empty result.");
             return null;
        }

        // Parse and return the solution
        const solutionMoves = solutionString.trim().split(/\s+/);
        updateStatus("Solution found! Preparing animation...");
        return solutionMoves;

    } catch (error) {
        // Catch any other unexpected JS errors
        console.error("Error during solving process execution:", error);
        updateStatus("Error calculating solution.");
        enableControls();
        return null;
    }
}

// Simple mapping from move notation to human-readable steps (basic)
function getMoveDescription(move) {
     const map = {
        'U': "Rotate Top face clockwise", 'U\'': "Rotate Top face counter-clockwise", 'U2': "Rotate Top face 180 degrees",
        'D': "Rotate Bottom face clockwise", 'D\'': "Rotate Bottom face counter-clockwise", 'D2': "Rotate Bottom face 180 degrees",
        'R': "Rotate Right face clockwise", 'R\'': "Rotate Right face counter-clockwise", 'R2': "Rotate Right face 180 degrees",
        'L': "Rotate Left face clockwise", 'L\'': "Rotate Left face counter-clockwise", 'L2': "Rotate Left face 180 degrees",
        'F': "Rotate Front face clockwise", 'F\'': "Rotate Front face counter-clockwise", 'F2': "Rotate Front face 180 degrees",
        'B': "Rotate Back face clockwise", 'B\'': "Rotate Back face counter-clockwise", 'B2': "Rotate Back face 180 degrees",
     };
     return map[move] || `Perform move: ${move}`;
}

// This mirrors logic from convertRotationToMoveNotation but outputs the internal index
function getInternalMoveCode(axis, layer, direction) {
    const angle = direction * Math.PI / 2;
    const prime = angle > 0; // CCW = prime for U/L/B etc.

    let moveStr = null;
    if (axis === AXIS.Y) { // U or D layer
        if (layer === CUBE_SIZE - 1) moveStr = prime ? "U'" : "U ";
        else if (layer === 0) moveStr = prime ? "D " : "D'";
    } else if (axis === AXIS.X) { // R or L layer
        if (layer === CUBE_SIZE - 1) moveStr = prime ? "R'" : "R ";
        else if (layer === 0) moveStr = prime ? "L " : "L'";
    } else if (axis === AXIS.Z) { // F or B layer
        if (layer === CUBE_SIZE - 1) moveStr = prime ? "F'" : "F ";
        else if (layer === 0) moveStr = prime ? "B " : "B'";
    }

    if (moveStr && typeof min2phase !== 'undefined' && Array.isArray(min2phase.move2str)) {
        return min2phase.move2str.indexOf(moveStr);
    }
    return -1; // Not found or invalid
}

function solveCubeStepByStep() {
    if (isAnimating) return;
    resetState();

    const solutionMoves = getSolutionForCurrentState(); // Get sequence like ["R ", "U'", "F2"]
    if (!solutionMoves || solutionMoves.length === 0) {
        updateStatus("Cube is already solved or no solution found.");
        updateInstructions([]);
        return;
    }

    // Prepare steps for display and execution
    solveSteps = solutionMoves.map(moveNotation => {
        // Find the visual parameters corresponding to this move notation
        const trimmedNotation = moveNotation.trim();
        const visualParams = moveMap[trimmedNotation];
        if (!visualParams) {
             console.warn(`Cannot find visual params for solution move: ${moveNotation}`);
             return null; // Skip this step if visual params unknown
        }
        return {
            move: moveNotation, // The notation from solver (e.g., "R ", "U'")
            description: getMoveDescription(trimmedNotation), // Description based on trimmed
            axis: visualParams.axis,
            layer: visualParams.layer,
            angle: visualParams.angle
        };
    }).filter(step => step !== null); // Filter out any steps we couldn't parse

    currentSolveStepIndex = 0;
    updateInstructions(solveSteps, currentSolveStepIndex);
    updateStatus("Solving...");
    disableControls();

    function nextStep() {
        if (currentSolveStepIndex < solveSteps.length) {
            const step = solveSteps[currentSolveStepIndex];
            updateInstructions(solveSteps, currentSolveStepIndex);

            // Call performMove with axis/layer/angle
            performMove(step.axis, step.layer, step.angle, step.move, 'solver')
                .then(() => {
                    currentSolveStepIndex++;
                    setTimeout(nextStep, 100);
                })
                .catch(error => {
                    console.error("Error during solving step:", error);
                    updateStatus("Error during solve.");
                    enableControls();
                });
        } else {
            updateStatus("Solved!");
            enableControls();
            updateInstructions(solveSteps, -1);
            solveSteps = [];
            currentSolveStepIndex = -1;
        }
    }
    nextStep();
}

function startLearnMode() {
     if (isAnimating) return;
     resetState();
     isLearnMode = true;

     const solutionMoves = getSolutionForCurrentState(); // Get steps for the current scramble
     if (!solutionMoves || solutionMoves.length === 0) {
         updateStatus("Cube is already solved or cannot generate learning steps.");
         updateInstructions([]);
         isLearnMode = false;
         return;
     }

     solveSteps = solutionMoves.map(move => ({ move: move, description: getMoveDescription(move), completed: false }));
     currentSolveStepIndex = 0;
     learnStepExpectedMove = solveSteps[currentSolveStepIndex].move;
     updateStatus(`Learn Mode: Waiting for Step 1: ${learnStepExpectedMove}`);
     updateInstructions(solveSteps, currentSolveStepIndex, solveSteps.map(s => s.completed)); // Show initial state
     disableControls(false); // Allow manual interaction
     learnButton.textContent = "Exit Learn Mode";
     solveButton.disabled = true; // Disable auto-solve in learn mode
}

function exitLearnMode() {
    isLearnMode = false;
    learnStepExpectedMove = null;
    solveSteps = [];
    currentSolveStepIndex = -1;
    updateStatus("Ready");
    updateInstructions(); // Clear instructions
    learnButton.textContent = "Learn to Solve";
    enableControls();
}

function checkLearnMove(userMove) { // userMove comes from convertRotationToMoveNotation (e.g., "D ")
    if (!isLearnMode || isAnimating || !learnStepExpectedMove) return;

    // --- >>> Normalize both moves by trimming whitespace <<< ---
    const expectedMoveTrimmed = learnStepExpectedMove.trim();
    const userMoveTrimmed = userMove.trim();
    // --- >>> END NORMALIZATION <<< ---

    console.log(`Learn Check: Expected='${expectedMoveTrimmed}', UserPerformed='${userMoveTrimmed}' (Original User Input='${userMove}')`);

    // --- >>> Compare the trimmed versions <<< ---
    if (userMoveTrimmed === expectedMoveTrimmed) {
        if (currentSolveStepIndex < solveSteps.length) {
             solveSteps[currentSolveStepIndex].completed = true;
        }
        currentSolveStepIndex++;

        if (currentSolveStepIndex >= solveSteps.length) {
             updateStatus("Congratulations! Cube solved (in Learn Mode).");
             updateInstructions(solveSteps, -1, solveSteps.map(s => s.completed));
             learnStepExpectedMove = null;
             enableControls();
        } else {
             learnStepExpectedMove = solveSteps[currentSolveStepIndex].move; // Get next expected move (original format from solver)
             updateStatus(`Correct! Next Step ${currentSolveStepIndex + 1}: ${learnStepExpectedMove.trim()}`); // Display trimmed version
             updateInstructions(solveSteps, currentSolveStepIndex, solveSteps.map(s => s.completed));
        }
    } else {
         // Display the expected move trimmed for clarity to the user
         updateStatus(`Incorrect move. Expected: ${expectedMoveTrimmed}. Try again.`);
    }
}
function resetState() {
    isLearnMode = false;
    solveSteps = [];
    currentSolveStepIndex = -1;
    learnStepExpectedMove = null;
    learnButton.textContent = "Learn to Solve";
    updateInstructions();

    // No need to reset state string here, createCube/reset button handles internal state reset
    enableControls();
    // Consider calling createCube() here if a full visual reset is always desired
    // createCube();
}

function disableControls(disableManualRotation = true) {
     scrambleButton.disabled = true;
     solveButton.disabled = true;
     learnButton.disabled = true;
     // Optionally disable manual rotation during auto-animations
     // but keep it enabled for Learn mode (handled inside startLearnMode)
}

function enableControls() {
    // Only enable if no animation is running
    if (!isAnimating) {
        scrambleButton.disabled = false;
        solveButton.disabled = isLearnMode; // Keep disabled if in learn mode
        learnButton.disabled = false;
    }
    // Manual rotation enabling/disabling is handled by interaction events
}

// --- Mouse Interaction for Face Rotation ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getIntersect(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cubies); // Only check cubies

    // Find the first intersection with a cubie face (not inner)
    for (let i = 0; i < intersects.length; i++) {
        if (intersects[i].object.userData.objectType === 'cubie' && intersects[i].face) {
             // Check if the face material is not the inner black material
             const faceMaterialIndex = intersects[i].face.materialIndex;
             if (intersects[i].object.material[faceMaterialIndex] !== FACE_MATERIALS.inner) {
                 return intersects[i];
             }
        }
    }
    return null; // No valid face intersected
}

function onPointerDown(event) {
    if (isAnimating || isRotatingView) return;

    currentIntersect = getIntersect(event);
    if (currentIntersect) {
        isDragging = true;
        // Store the starting point relative to the canvas
        const rect = renderer.domElement.getBoundingClientRect();
        dragStartPoint = {
             x: event.clientX - rect.left,
             y: event.clientY - rect.top,
             intersect: currentIntersect
        };
        controls.enabled = false; // Disable camera control while dragging face
         // Prevent default browser drag behavior
        event.preventDefault();
    }
}

function onPointerMove(event) {
     if (isAnimating || !isDragging || !dragStartPoint || isRotatingView) return;

     const rect = renderer.domElement.getBoundingClientRect();
     const currentX = event.clientX - rect.left;
     const currentY = event.clientY - rect.top;

     const deltaX = currentX - dragStartPoint.x;
     const deltaY = currentY - dragStartPoint.y;

     // Determine move based on drag direction and intersected face normal
     if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) { // Threshold to confirm drag
         const dragVector = new THREE.Vector2(deltaX, deltaY);
         determineAndPerformDragMove(dragStartPoint.intersect, dragVector);
         isDragging = false; // Perform only one move per drag
         dragStartPoint = null;
         currentIntersect = null;
         // Re-enable controls after a short delay to prevent accidental view rotation
         setTimeout(() => { if (!isRotatingView && !isDragging) controls.enabled = true; }, 50);
     }
}

function onPointerUp(event) {
     if (isAnimating || isRotatingView) return;

    if (isDragging) {
        isDragging = false;
        dragStartPoint = null;
        currentIntersect = null;
        // Re-enable controls immediately if no move was made,
        // or after a delay if a move was triggered in onPointerMove
         if (!isRotatingView) controls.enabled = true;
    }
}

// Complex part: Determine rotation axis/layer/direction from drag
function determineAndPerformDragMove(intersectData, dragVector) {
    if (!intersectData || !intersectData.face) return;

    const cubie = intersectData.object;
    const face = intersectData.face;
    const point = intersectData.point; // Intersection point in world space
    const normal = face.normal.clone(); // Face normal in local space

    // Transform the normal to world space
    const worldNormal = normal.transformDirection(cubie.matrixWorld).normalize();

    // Determine the dominant axis of the normal (which face was clicked: X, Y, or Z)
    let faceAxis = AXIS.X;
    if (Math.abs(worldNormal.y) > Math.abs(worldNormal.x) && Math.abs(worldNormal.y) > Math.abs(worldNormal.z)) {
        faceAxis = AXIS.Y;
    } else if (Math.abs(worldNormal.z) > Math.abs(worldNormal.x) && Math.abs(worldNormal.z) > Math.abs(worldNormal.y)) {
        faceAxis = AXIS.Z;
    }

    // Get the cubie's approximate logical position to determine the layer index
     const worldPos = new THREE.Vector3();
     cubie.getWorldPosition(worldPos);
     let layerIndex;
     let rotationAxis;
     let direction = 1; // 1 for clockwise relative to positive axis, -1 for counter-clockwise

     // Project the drag vector onto the plane perpendicular to the camera view vector
     // This is tricky, a simpler approach uses screen space direction relative to face normal
     const camVec = new THREE.Vector3();
     camera.getWorldDirection(camVec);

     // Determine rotation axis based on clicked face and drag direction
     // Example: Clicking FRONT face (Z+)
     if (faceAxis === AXIS.Z) {
         // Dragging horizontally (deltaX) should rotate around Y axis
         // Dragging vertically (deltaY) should rotate around X axis
         if (Math.abs(dragVector.x) > Math.abs(dragVector.y)) { // Horizontal drag
             rotationAxis = AXIS.Y;
             layerIndex = Math.round((worldPos.y + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
             // Direction depends on which Z face (+Z or -Z) and drag direction (left/right)
             direction = (worldNormal.z > 0) ? (dragVector.x > 0 ? 1 : -1) : (dragVector.x < 0 ? 1 : -1);
         } else { // Vertical drag
             rotationAxis = AXIS.X;
             layerIndex = Math.round((worldPos.x + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
              // Direction depends on drag direction (up/down)
             direction = (dragVector.y < 0 ? 1 : -1) ; // Dragging down is often clockwise for X rotation on Front
         }
     }
     // Example: Clicking UP face (Y+)
     else if (faceAxis === AXIS.Y) {
         if (Math.abs(dragVector.x) > Math.abs(dragVector.y)) { // Horizontal drag
             rotationAxis = AXIS.Z;
             layerIndex = Math.round((worldPos.z + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
             // Direction depends on drag direction (left/right)
             direction = (dragVector.x < 0 ? 1 : -1); // Dragging left is often clockwise for Z on Top face
         } else { // Vertical drag
             rotationAxis = AXIS.X;
             layerIndex = Math.round((worldPos.x + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
             // Direction depends on which Y face (+Y or -Y) and drag direction (up/down)
             direction = (worldNormal.y > 0) ? (dragVector.y > 0 ? 1 : -1) : (dragVector.y < 0 ? 1 : -1);
         }
     }
     // Example: Clicking RIGHT face (X+)
     else { // faceAxis === AXIS.X
         if (Math.abs(dragVector.y) > Math.abs(dragVector.x)) { // Vertical drag
             rotationAxis = AXIS.Z;
             layerIndex = Math.round((worldPos.z + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
             // Direction depends on drag direction (up/down)
             direction = (dragVector.y < 0 ? 1 : -1); // Dragging down is often clockwise for Z on Right face
         } else { // Horizontal drag
             rotationAxis = AXIS.Y;
             layerIndex = Math.round((worldPos.y + CUBE_CENTER_OFFSET) / TOTAL_CUBIE_SIZE);
             // Direction depends on which X face (+X or -X) and drag direction (left/right)
             direction = (worldNormal.x > 0) ? (dragVector.x < 0 ? 1 : -1) : (dragVector.x > 0 ? 1 : -1);
         }
     }

     // --- Convert rotation parameters to standard move notation for display/learn mode ---
    const visualMoveNotation = convertRotationToMoveNotation(rotationAxis, layerIndex, direction); // Still needed for learn mode check maybe?
    if(visualMoveNotation == null){
        return; // Invalid move notation, do not proceed
    }
    const rotationAngle = direction * Math.PI / 2; // Calculate angle for visual rotation

    console.log(`Detected Drag Move: Axis=${rotationAxis}, Layer=${layerIndex}, Angle=${rotationAngle.toFixed(2)}, Notation=${visualMoveNotation}`);

    if (rotationAxis && layerIndex !== undefined) {
         // Perform the rotation visually AND update internal state using axis/layer/angle
         performMove(rotationAxis, layerIndex, rotationAngle, visualMoveNotation || 'N/A', 'drag')
             .then(() => {
                 // Check if the move was correct in Learn Mode - USE visualMoveNotation
                 if (isLearnMode && visualMoveNotation) {
                     checkLearnMove(visualMoveNotation);
                 }
             })
             .catch(err => console.error("Error performing dragged move:", err));
    } else {
         console.warn("Could not determine valid move parameters from drag.");
    }
}

// Convert calculated rotation parameters back into standard notation (e.g., "R", "U'")
function convertRotationToMoveNotation(axis, layer, direction) {
    const angle = direction * Math.PI / 2;
    const prime = angle > 0; // Positive angle in our setup means counter-clockwise for U/L/B, prime notation

    // Match the format in min2phase.move2str
    if (axis === AXIS.Y) { // U or D layer
        if (layer === CUBE_SIZE - 1) return prime ? "U'" : "U "; // Top face (U/U')
        if (layer === 0) return prime ? "D " : "D'"; // Bottom face (D/D') - Note D is clockwise view from bottom
    } else if (axis === AXIS.X) { // R or L layer
        if (layer === CUBE_SIZE - 1) return prime ? "R'" : "R "; // Right face (R/R')
        if (layer === 0) return prime ? "L " : "L'"; // Left face (L/L')
    } else if (axis === AXIS.Z) { // F or B layer
        if (layer === CUBE_SIZE - 1) return prime ? "F'" : "F "; // Front face (F/F')
        if (layer === 0) return prime ? "B " : "B'"; // Back face (B/B')
    }
    return null; // Invalid combination
}




// --- Keyboard Interaction (Spacebar for view rotation) ---
window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !isDragging && !isAnimating) {
        isRotatingView = true;
        controls.enableRotate = true; // Enable OrbitControls rotation
        controls.enabled = true;      // Ensure controls are generally enabled
        canvasContainer.style.cursor = 'grab';
    }
});

window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
        isRotatingView = false;
        controls.enableRotate = false; // Disable OrbitControls rotation
        // Controls might still be enabled if user is not dragging a face
        canvasContainer.style.cursor = 'default';
    }
});


// --- Initialization ---
function init() {
    //populateColorMap();

    updateStatus("Initializing solver data...");
    console.log("Initializing min2phase solver...");
    try {
        requestAnimationFrame(() => { // Defer solver init and first cube creation
            console.time("Solver Init");
            min2phase.initFull();
            console.timeEnd("Solver Init");
            isSolverInitialized = true;
            console.log("Solver initialized.");

            // >>> Create the first cube AFTER solver is initialized <<<
            createCube(); // Creates visual cube AND initializes internal state now
            resizeRenderer(); // Resize after canvas/container is ready

            updateStatus("Ready");
            enableControls();
       });
    } catch (e) {
         console.error("Failed to initialize solver:", e);
         updateStatus("Error: Solver failed to initialize!");
         solveButton.disabled = true;
         learnButton.disabled = true;
         isSolverInitialized = false;
    }
    // --- End Solver Initialization ---

    // Event Listeners
    scrambleButton.addEventListener('click', scrambleCube);
    solveButton.addEventListener('click', solveCubeStepByStep);
    learnButton.addEventListener('click', () => {
         if (isLearnMode) {
             exitLearnMode();
         } else {
             startLearnMode();
         }
    });
    // resetViewButton.addEventListener('click', () => {
    //     controls.reset();
    //     camera.position.set(4, 4, 6);
    //     controls.target.set(scene.position.x, scene.position.y, scene.position.z);
    //     controls.update();
    
    //     if (!isAnimating) {
    //         updateStatus("Resetting cube state...");
    
    //         // --- >>> ADD THIS LINE <<< ---
    //         TWEEN.removeAll(); // Stop all active tweens immediately
    
    //         createCube(); // Re-creates visual cube & resets internal state
    //         resetState(); // Clear instructions, flags etc.
    //         updateStatus("Ready");
    //     } else {
    //         // Optional: Handle the case where reset is clicked DURING an animation
    //         // Maybe just reset the view without touching the cube state,
    //         // or force stop the animation first.
    //         console.log("Cannot reset cube state while animating. View reset only.");
    //         // TWEEN.removeAll(); // Or maybe stop animation here too?
    //         // isAnimating = false;
    //         updateStatus("Animation in progress. View reset.");
    //     }
    // });

    // Use pointer events for better touch/mouse compatibility
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp); // Treat leaving canvas as pointer up

    animate(); // Start render loop
}

// Render Loop
function animate(time) {
    requestAnimationFrame(animate);

    TWEEN.update(time); // Update animations
    controls.update(); // Required if damping or auto-rotate enabled

    renderer.render(scene, camera);
}

// --- Start ---
init();