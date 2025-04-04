// --- In app.js ---
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, clock, mixer, characterMesh, idleAction;
const visemeMap = {}; // To store { visemeName: morphTargetIndex }

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3); // Adjust camera position

    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('characterCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // document.body.appendChild(renderer.domElement); // Or use existing canvas

    clock = new THREE.Clock();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff);
    dirLight.position.set(3, 10, 10);
    scene.add(dirLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0); // Adjust target based on model height
    controls.update();

    // Load Model
    const loader = new GLTFLoader();
    loader.load(
        'character3.glb', // <--- IMPORTANT: Set correct path
        (gltf) => {
            const model = gltf.scene;
            scene.add(model);

            // --- Find the mesh with morph targets ---
            model.traverse((object) => {
                if (object.isMesh && object.morphTargetInfluences) {
                    characterMesh = object;
                    console.log("Found mesh with morph targets:", characterMesh);
                    console.log("Morph Target Dictionary:", characterMesh.morphTargetDictionary);

                    // --- EXAMPLE: Map visemes to indices (ADJUST NAMES!) ---
                    if (characterMesh.morphTargetDictionary) {
                        // visemeMap['A'] = characterMesh.morphTargetDictionary['viseme_PP']; // Example: 'PP' often covers A, I, U sounds
                        // visemeMap['O'] = characterMesh.morphTargetDictionary['viseme_O'];  // Example: 'O' covers O, W sounds
                        // visemeMap['F'] = characterMesh.morphTargetDictionary['viseme_FF']; // Example: 'FF' covers F, V sounds
                        // visemeMap['M'] = characterMesh.morphTargetDictionary['viseme_MBP'];// Example: 'MBP' covers M, B, P, Silence
                        
                        // Aviable viseme names in glb file
                        //
                        // viseme_CH: 11
                        // viseme_DD: 9
                        // viseme_E: 16
                        // viseme_FF: 7
                        // viseme_I: 17
                        // viseme_O: 18
                        // viseme_PP: 6
                        // viseme_RR: 14
                        // viseme_SS: 12
                        // viseme_TH: 8
                        // viseme_U: 19
                        // viseme_aa: 15
                        // viseme_kk: 10
                        // viseme_nn: 13
                        // viseme_sil: 5
                        visemeMap['CH'] = characterMesh.morphTargetDictionary['viseme_CH'];
                        visemeMap['DD'] = characterMesh.morphTargetDictionary['viseme_DD'];
                        visemeMap['E'] = characterMesh.morphTargetDictionary['viseme_E'];
                        visemeMap['F'] = characterMesh.morphTargetDictionary['viseme_FF'];
                        visemeMap['I'] = characterMesh.morphTargetDictionary['viseme_I'];
                        visemeMap['O'] = characterMesh.morphTargetDictionary['viseme_O'];
                        visemeMap['A'] = characterMesh.morphTargetDictionary['viseme_PP'];
                        visemeMap['M'] = characterMesh.morphTargetDictionary['viseme_RR'];
                        visemeMap['SS'] = characterMesh.morphTargetDictionary['viseme_SS'];
                        visemeMap['TH'] = characterMesh.morphTargetDictionary['viseme_TH'];
                        visemeMap['U'] = characterMesh.morphTargetDictionary['viseme_U'];
                        visemeMap['aa'] = characterMesh.morphTargetDictionary['viseme_aa'];
                        visemeMap['kk'] = characterMesh.morphTargetDictionary['viseme_kk'];
                        visemeMap['nn'] = characterMesh.morphTargetDictionary['viseme_nn'];
                        visemeMap['sil'] = characterMesh.morphTargetDictionary['viseme_sil'];
                        
                        // ... Add mappings for other key shapes your model has (e.g., E, TH, L)
                    } else {
                         console.error("Morph Target Dictionary not found on mesh!");
                    }
                }
            });

            if (!characterMesh) {
                console.error("Could not find a mesh with morph targets in the GLB.");
                return; // Stop if no morph targets
            }

            // --- Setup Animation ---
            mixer = new THREE.AnimationMixer(model);
            const talkAnimName = 'TalkingIdle'; // <--- IMPORTANT: Set correct animation name
            const clip = THREE.AnimationClip.findByName(gltf.animations, talkAnimName);
            if (clip) {
                idleAction = mixer.clipAction(clip);
                // Don't play immediately, wait for speech
                console.log(`Found animation: ${talkAnimName}`);
            } else {
                console.warn(`Animation clip "${talkAnimName}" not found in GLB.`);
                // Maybe find *any* animation as a fallback?
                 if (gltf.animations.length > 0) {
                     idleAction = mixer.clipAction(gltf.animations[0]);
                     console.warn(`Using first animation clip: ${gltf.animations[0].name}`);
                 }
            }

            // Initial setup complete, model ready
            document.getElementById('speakButton').disabled = false; // Enable button
            console.log("Model loaded successfully.");
        },
        undefined, // Progress callback (optional)
        (error) => {
            console.error('Error loading GLB:', error);
            alert('Failed to load the character model.');
        }
    );

    // Start the animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) {
        mixer.update(delta);
    }
    renderer.render(scene, camera);
}

// --- Add Event Listeners and Speech Logic (see next steps) ---

// --- Initialize ---
document.getElementById('speakButton').disabled = true; // Disable until model loads
init();
window.addEventListener('resize', () => { // Handle window resize
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Continue in app.js ---

let currentSpeechUtterance = null;

function setupSpeech() {
    const speakButton = document.getElementById('speakButton');
    const textInput = document.getElementById('textInput');

    if (!('speechSynthesis' in window)) {
        alert('Sorry, your browser does not support text-to-speech!');
        speakButton.disabled = true;
        return;
    }

    speakButton.addEventListener('click', () => {
        if (speechSynthesis.speaking) {
            // Optional: Allow interrupting speech
            // speechSynthesis.cancel();
            console.log("Already speaking.");
            return;
        }

        const text = textInput.value;
        if (text.trim() === '' || !characterMesh) {
            return; // No text or model not ready
        }

        currentSpeechUtterance = new SpeechSynthesisUtterance(text);

        // --- Speech Event Handlers ---
        currentSpeechUtterance.onstart = () => {
            console.log("Speech started");
            if (idleAction) {
                idleAction.reset().play(); // Start body animation
            }
            resetLipSync(); // Prepare lips
        };

        currentSpeechUtterance.onend = () => {
            console.log("Speech finished");
             if (idleAction) {
                // Optional: fade out instead of abrupt stop
                idleAction.fadeOut(0.5); // Fade out over 0.5 seconds
                // Need to ensure it stops fully after fade, e.g., using a timeout or mixer 'finished' event
                setTimeout(() => idleAction.stop(), 500);
            }
            resetLipSync(); // Close mouth
            currentSpeechUtterance = null;
        };

        currentSpeechUtterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            resetLipSync();
             if (idleAction) idleAction.stop();
             currentSpeechUtterance = null;
        };

        // --- Lip Sync via onboundary (APPROXIMATE) ---
        let lastViseme = 'M'; // Start closed
        currentSpeechUtterance.onboundary = (event) => {
             if (!characterMesh || event.name !== 'word') return; // Only process word boundaries

             const currentTime = event.elapsedTime / 1000; // Convert ms to s
             console.log(`Word boundary at: ${currentTime}s`);

             // Simple cycling example (replace with smarter logic)
             let nextViseme;
             if (lastViseme === 'M') nextViseme = 'A';
             else if (lastViseme === 'A') nextViseme = 'O';
             else nextViseme = 'M'; // Cycle M -> A -> O -> M

             // Update morph targets
             updateViseme(nextViseme);
             lastViseme = nextViseme;
        };

        // Optional: Configure voice (find available voices)
        // const voices = speechSynthesis.getVoices();
        // utterance.voice = voices[/* choose a voice index */];
        // utterance.lang = 'en-US'; // Set language

        speechSynthesis.speak(currentSpeechUtterance);
    });
}

function resetLipSync() {
    if (!characterMesh || !characterMesh.morphTargetInfluences) return;
    // Set all mapped visemes to 0
    for (const key in visemeMap) {
        const index = visemeMap[key];
         if (index !== undefined && characterMesh.morphTargetInfluences[index] !== undefined) {
             characterMesh.morphTargetInfluences[index] = 0;
         }
    }
    // Optionally force closed mouth ('M') shape
    const closedIndex = visemeMap['M'];
     if (closedIndex !== undefined && characterMesh.morphTargetInfluences[closedIndex] !== undefined) {
         characterMesh.morphTargetInfluences[closedIndex] = 0.8; // Slightly closed
     }
}

// Basic function to set a single viseme (no smoothing)
function updateViseme(visemeName) {
     if (!characterMesh || !characterMesh.morphTargetInfluences) return;

     const targetIndex = visemeMap[visemeName];

     // Reset all influences first
     for (const key in visemeMap) {
        const index = visemeMap[key];
         if (index !== undefined && characterMesh.morphTargetInfluences[index] !== undefined) {
             characterMesh.morphTargetInfluences[index] = 0;
         }
     }

     // Set the target influence
     if (targetIndex !== undefined && characterMesh.morphTargetInfluences[targetIndex] !== undefined) {
         characterMesh.morphTargetInfluences[targetIndex] = 1.0; // Set to full influence
         // console.log(`Setting viseme: ${visemeName} (Index: ${targetIndex})`);
     } else {
         console.warn(`Viseme "${visemeName}" not found in map or model.`);
         // Fallback to closed mouth if target not found?
         const closedIndex = visemeMap['M'];
          if (closedIndex !== undefined && characterMesh.morphTargetInfluences[closedIndex] !== undefined) {
              characterMesh.morphTargetInfluences[closedIndex] = 0.8;
          }
     }
}

//https://att-c.udemycdn.com/2022-11-29_00-48-15-031aa949ab525f8690b0fc5042970289/original.zip?response-content-disposition=attachment%3B+filename%3DCharacter%2BCreation%2B%2526%2BAnimation%2B.Blends.zip&Expires=1743799748&Signature=yjatCMl8Dxqxk4cB8wSq-oziBGmJdlzF8wfKmUQDFHo12JSSpzFgjFCSExy8J595pz579Bya8XgT~vrL7TKqqcN2dHUPORTvlARUejFOssGcSz3cvegacD36fE-m89kgYJRfO7VWNIKeC0W1daGG-aNlAsZTHVGvc0YXbnmy29jVcvbw7IRtIp9LO3AWTbX-q3gUe2vOVEThip0rJT~lmQAZQGgGKH05I2KzZlL0dhBfffjkdtOaPC6rG2oKxEWVUkCNOb74YSIXrcIHpT~CktDyPXGH5yySbHUgbV4DZKn81jsdgi4RJ5nMdXL1mIbeDEUSYU175VlsKlxuQ8axaQ__&Key-Pair-Id=K3MG148K9RIRF4
// --- Final steps in init() or after ---
// init(); // Called previously
setupSpeech(); // Add speech event listeners after init elements exist
