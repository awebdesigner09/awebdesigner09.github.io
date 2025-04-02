// Basic Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0); // Match body background

const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('rubiks-canvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

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
    // Clear previous cube if exists
    scene.remove(cube);
    cube = new THREE.Group();
    cubies = [];

    for (let x = 0; x < CUBE_SIZE; x++) {
        for (let y = 0; y < CUBE_SIZE; y++) {
            for (let z = 0; z < CUBE_SIZE; z++) {
                // Don't create the inner core cubie (optional, saves geometry)
                if (x > 0 && x < CUBE_SIZE - 1 && y > 0 && y < CUBE_SIZE - 1 && z > 0 && z < CUBE_SIZE - 1) {
                    continue;
                }
                const cubie = createCubie(x, y, z);
                cubies.push(cubie);
                cube.add(cubie);
            }
        }
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
function performMove(move) {
    if (isAnimating) return Promise.reject("Animation in progress");

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

    const params = moveMap[move];
    if (!params) {
        console.warn(`Unknown move: ${move}`);
        return Promise.reject(`Unknown move: ${move}`);
    }

    // For double moves (R2), perform two single turns visually
    if (move.endsWith('2')) {
         const singleMove = move.substring(0, 1); // e.g., R from R2
         const singleParams = moveMap[singleMove];
         return new Promise((resolve) => {
             rotateLayer(singleParams.axis, singleParams.layer, singleParams.angle, 200, () => {
                 rotateLayer(singleParams.axis, singleParams.layer, singleParams.angle, 200, resolve);
             });
         });
    } else {
        return new Promise((resolve) => {
            rotateLayer(params.axis, params.layer, params.angle, 300, resolve);
        });
    }
}


// --- Scramble, Solve, Learn ---

function scrambleCube() {
    if (isAnimating) return;
    resetState(); // Clear solve/learn state

    const moves = ["U", "D", "L", "R", "F", "B"];
    const modifiers = ["", "'", "2"];
    const scrambleSequence = [];
    const scrambleLength = 20; // Standard scramble length

    updateStatus("Scrambling...");
    disableControls();

    for (let i = 0; i < scrambleLength; i++) {
        const move = moves[Math.floor(Math.random() * moves.length)];
        const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
        scrambleSequence.push(move + modifier);
    }

    console.log("Scramble Sequence:", scrambleSequence.join(' '));

    // Apply scramble moves instantly (or with very short delay)
    let currentMove = 0;
    function applyNextMove() {
        if (currentMove < scrambleSequence.length) {
            const move = scrambleSequence[currentMove++];
            const params = performMove(move); // Get rotation parameters
             if (params instanceof Promise) { // performMove now returns promise
                 params.then(applyNextMove).catch(err => console.error(err));
             } else { // Should not happen now but keep for safety
                 applyNextMove();
             }
        } else {
             updateStatus("Scrambled. Ready.");
             enableControls();
        }
    }
    // Start applying the scramble
     applyNextMove();

    // Note: In a real solver, you'd update the cube's logical state here.
    // For this visualizer, the visual state *is* the state after rotation.
}


// Simulate getting a solution string (replace with actual solver if integrated)
function getSolutionForCurrentState() {
    // !!! Placeholder !!!
    // In a real application, you would:
    // 1. Get the current state of the cube (e.g., facelet string).
    // 2. Pass this state to a solving algorithm (like Kociemba or a beginner's method solver).
    // 3. The solver returns a sequence of moves.

    // For demonstration, let's return a simple sequence.
    // This won't actually solve a scrambled cube, just demonstrates the animation.
    console.warn("Using placeholder solution sequence!");
    return ["R", "U", "R'", "U'", "F'", "U", "F", "L", "U", "L'"]; // Example sequence
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


function solveCubeStepByStep() {
    if (isAnimating) return;
    resetState();

    const solutionMoves = getSolutionForCurrentState(); // Get the sequence
    if (!solutionMoves || solutionMoves.length === 0) {
        updateStatus("Cube is already solved or no solution found.");
        updateInstructions([]);
        return;
    }

    solveSteps = solutionMoves.map(move => ({ move: move, description: getMoveDescription(move) }));
    currentSolveStepIndex = 0;
    updateInstructions(solveSteps, currentSolveStepIndex);
    updateStatus("Solving...");
    disableControls(); // Disable manual interaction during auto-solve

    function nextStep() {
        if (currentSolveStepIndex < solveSteps.length) {
            const step = solveSteps[currentSolveStepIndex];
            updateInstructions(solveSteps, currentSolveStepIndex); // Highlight current step
            performMove(step.move)
                .then(() => {
                    currentSolveStepIndex++;
                    // Small delay before starting next animation for better visualization
                    setTimeout(nextStep, 100); // 100ms delay between steps
                })
                .catch(error => {
                    console.error("Error during solving step:", error);
                    updateStatus("Error during solve.");
                    enableControls(); // Re-enable on error
                });
        } else {
            updateStatus("Solved!");
            enableControls();
            updateInstructions(solveSteps, -1); // Clear highlight when done
            solveSteps = []; // Clear steps
            currentSolveStepIndex = -1;
        }
    }

    nextStep(); // Start the process
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

function checkLearnMove(userMove) {
    if (!isLearnMode || isAnimating || !learnStepExpectedMove) return;

    console.log(`Learn Check: Expected: ${learnStepExpectedMove}, User Performed: ${userMove}`);

    if (userMove === learnStepExpectedMove) {
        // Mark step as completed
        if (currentSolveStepIndex < solveSteps.length) {
             solveSteps[currentSolveStepIndex].completed = true;
        }

        currentSolveStepIndex++;

        if (currentSolveStepIndex >= solveSteps.length) {
             // Learning finished
             updateStatus("Congratulations! Cube solved (in Learn Mode).");
             updateInstructions(solveSteps, -1, solveSteps.map(s => s.completed)); // Show all completed
             // exitLearnMode(); // Optionally exit automatically
             learnStepExpectedMove = null; // No more expected moves
             enableControls(); // Ensure controls are enabled
        } else {
             // Proceed to next step
             learnStepExpectedMove = solveSteps[currentSolveStepIndex].move;
             updateStatus(`Correct! Next Step ${currentSolveStepIndex + 1}: ${learnStepExpectedMove}`);
             updateInstructions(solveSteps, currentSolveStepIndex, solveSteps.map(s => s.completed)); // Highlight next
        }
    } else {
         updateStatus(`Incorrect move. Expected: ${learnStepExpectedMove}. Try again.`);
         // Maybe add a visual cue for incorrect move later
    }
}

function resetState() {
    isLearnMode = false;
    solveSteps = [];
    currentSolveStepIndex = -1;
    learnStepExpectedMove = null;
    learnButton.textContent = "Learn to Solve";
    updateInstructions();
    enableControls(); // Make sure controls are enabled
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

     // --- Convert rotation parameters to standard move notation ---
     // This is needed for Learn Mode checking
     let moveNotation = convertRotationToMoveNotation(rotationAxis, layerIndex, direction);
     console.log(`Detected Move: Axis=${rotationAxis}, Layer=${layerIndex}, Dir=${direction}, Notation=${moveNotation}`);

     if (moveNotation) {
          // Perform the rotation visually
         performMove(moveNotation)
             .then(() => {
                 // Check if the move was correct in Learn Mode
                 if (isLearnMode) {
                     checkLearnMove(moveNotation);
                 }
             })
             .catch(err => console.error("Error performing dragged move:", err));

     } else {
         console.warn("Could not determine valid move from drag.");
     }
}

// Convert calculated rotation parameters back into standard notation (e.g., "R", "U'")
function convertRotationToMoveNotation(axis, layer, direction) {
    const angle = direction * Math.PI / 2; // Assume single 90-degree turns from drag
    const prime = angle > 0; // Positive angle usually means counter-clockwise for U/L/B, prime notation

    if (axis === AXIS.Y) { // U or D layer
        if (layer === CUBE_SIZE - 1) return prime ? "U'" : "U";
        if (layer === 0) return prime ? "D" : "D'"; // D rotation is opposite U
    } else if (axis === AXIS.X) { // R or L layer
        if (layer === CUBE_SIZE - 1) return prime ? "R'" : "R";
        if (layer === 0) return prime ? "L" : "L'"; // L rotation is opposite R
    } else if (axis === AXIS.Z) { // F or B layer
        if (layer === CUBE_SIZE - 1) return prime ? "F'" : "F";
        if (layer === 0) return prime ? "B" : "B'"; // B rotation is opposite F
    }
    return null; // Invalid combination (e.g., middle slice if not implemented)
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
    createCube();
    resizeRenderer(); // Initial sizing
    resetState();
    updateStatus("Ready");

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
     resetViewButton.addEventListener('click', () => {
        controls.reset(); // Resets camera to saved position
        camera.position.set(4, 4, 6); // Or set to desired default
        camera.lookAt(scene.position);
    });


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