// Imports --------------------------------------------------------------------------------------------------
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { BloomPass } from "three/addons/postprocessing/BloomPass.js";

// HTML Elements --------------------------------------------------------------------------------------------
const loadingScreen = document.getElementById("loading-screen");
const loadingLabel = document.getElementById("loading-label")
const progressBar = document.getElementById("progress-value");

// Globals --------------------------------------------------------------------------------------------------
const loadingManager = new THREE.LoadingManager( 
	() => {
		loadingScreen.classList.add("loading-fade-out");
		loadingScreen.addEventListener("transitionend", onTransitionEnd);
	},
	(url, loading, total) => {
		//progressBar.value = (loading/total * 100);
		progressBar.style.width = (loading/total * 100).toString() + "%";
		
	},
);
let vertexShader;
let fragmentShader;
var scene, camera, renderer, htmlRenderer, composer, clock, solarUniforms, solarMesh, cameraIndex, look;
var startQuaternion = new THREE.Quaternion();
var targetQuaternion = new THREE.Quaternion();
var planets, orbits, orbitLines;
var startingPositions = [];
var htmlLabels = [];
var renderedLabel = false;
var systemView;
var startingLabel;
var endingLabel;

// Scene Construction ---------------------------------------------------------------------------------------
function createSolarCentre() {
	const textureLoader = new THREE.TextureLoader(loadingManager);

	const solarTile = textureLoader.load('static/solarTexture.png');
	solarTile.colorSpace = THREE.SRGBColorSpace;
	solarTile.wrapS = solarTile.wrapT = THREE.RepeatWrapping;

	const solarNoise = textureLoader.load('static/noiseTexture.png');
	solarNoise.wrapS = solarNoise.wrapT = THREE.RepeatWrapping;

	// Uniforms -------------------------------------------------------------------------------------------------
	solarUniforms = {
		"time": { value: 1.0 },
		"fogDensity": { value: 0 },
		"fogColour": { value: new THREE.Vector3(0,0,0) },
		"uvScale": { value: new THREE.Vector2(3.0, 1.0) },
		"texture1": { value: solarNoise },
		"texture2": { value: solarTile }
	};

	// Solar Object in Orbit
	const solarGeometry = new THREE.SphereGeometry(1);
	const solarMaterial = new THREE.ShaderMaterial({
		uniforms: solarUniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader
	});
	solarMesh = new THREE.Mesh(solarGeometry, solarMaterial);
	solarMesh.rotation.x = 0.3;

	return solarMesh;
}

function createSunLight() {
	const solarLight = new THREE.PointLight(0xffffff, 100);
	solarLight.power = 50000;
	solarLight.position.set(0,0,0);
	return solarLight;
}

function createGalaxyLight() {
	const galaxyLight = new THREE.AmbientLight(0x00ff9d);
	return galaxyLight;
}

async function createPlanetsInOrbit(scene) {
	const modelPath = "./static/"; 
	const modelLoader = new GLTFLoader(loadingManager);

	var planetCache = [];

	// Create Planet Objects ------------------------------------------------------------------------------------
	var new_z = -3;
	for (let index = 1; index < 12; index++) {
		const path = modelPath+"Planet-"+index.toString()+".glb";
		let gltf = await modelLoader.loadAsync(path);

		const newPlanet = new THREE.Object3D();
		newPlanet.add(gltf.scene);
		newPlanet.scale.set(0.3, 0.3, 0.3);
		newPlanet.position.set(0,0, new_z);
		planetCache.push(newPlanet);
		scene.add(newPlanet);

		new_z -= 2;
	}

	// ----------------------------------------------------
	// Test planet 1 multi texture
	// const planetVShader = await (await fetch("./shaders/planet1VertexShader.glsl")).text();
	// const planetFShader = await (await fetch("./shaders/planet1FragmentShader.glsl")).text();
	
	// const textureLoader = new THREE.TextureLoader();

	// const planetaryDiffuse = textureLoader.load('static/csilla/planet-1-diffuse.png');
	// const planetaryBump = textureLoader.load('static/csilla/planet-1-bump.png');
	
	// const planetaryUniforms = {
	// 	"diffuse_texture": { value: planetaryDiffuse },
	// };

	// const newPlanet = new THREE.Object3D();
	
	// const solarGeometry = new THREE.SphereGeometry(1);
	// const solarMaterial = new THREE.ShaderMaterial({
	// 	uniforms: planetaryUniforms,
	// 	vertexShader: planetVShader,
	// 	fragmentShader: planetFShader,

	// });
	// const planetaryMesh = new THREE.Mesh(solarGeometry, solarMaterial);
	// newPlanet.add(planetaryMesh);
	// newPlanet.position.set(0, 0, -100);
	// scene.add(newPlanet);

	//planetCache.unshift(newPlanet);
	


	// ----------------------------------------------------

	return Promise.all(planetCache);
}

function createPlanetaryOrbits() {
	let planetaryCurves = [];
	let planetaryLines = [];

	let sizeOfKeplerOrbitX = 20;
	let sizeOfKeplerOrbitY = 15;

	let max = 0.55;
	let min = 0.45;

	for (let i = 0; i < 11; i++) {
		var randomRotation = Math.random() * (max-min) + min;
		var randomColor = Math.floor(Math.random()*16777215);

		let planetaryCurve = new THREE.EllipseCurve(0, 0, sizeOfKeplerOrbitX, sizeOfKeplerOrbitY);
		let planetaryLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(planetaryCurve.getSpacedPoints(100)), new THREE.LineBasicMaterial({
			opacity: 0.0,
			transparent: true
		}));

		//planetaryLine.rotation.x = -Math.PI * 0.5;
		planetaryLine.rotation.x = -Math.PI * randomRotation;

		planetaryCurves.push(planetaryCurve);
		planetaryLines.push(planetaryLine);

		sizeOfKeplerOrbitY += 10;
		sizeOfKeplerOrbitX += 10;
	}

	return {planetaryCurves, planetaryLines};
}

function randomizeStartingOrbitPosition() {
	for (let index = 0; index < 11; index++) {
		let planet = planets[index];

		if (planet) {
			let startPosition = Math.random();
			startingPositions[index] = startPosition;
		}
	}
}

function setHTMLLabels() {
	const startendpanels = document.getElementsByClassName("starting-ending-panel");
	startingLabel = new CSS2DObject(startendpanels[0]);
	endingLabel = new CSS2DObject(startendpanels[1]);

	const informationPanels = document.getElementsByClassName("information-panel");

	for (let i = 0; i < 5; i++) {
		let newCSSObject = new CSS2DObject(informationPanels[i]);
		htmlLabels.push(newCSSObject);
	}

}

// Initialisation -------------------------------------------------------------------------------------------
async function initialisation() {
	// ThreeJS Settings -----------------------------------------------------------------------------------------
	const container = document.getElementById("container");

	scene = new THREE.Scene();
	const width = window.innerWidth;
	const height = window.innerHeight;
	const aspectRatio = width / height;
	
	camera = new THREE.PerspectiveCamera( 75, aspectRatio, 0.1, 1000 );
	camera.position.set(0, 0, 5);

	clock = new THREE.Clock();

	// Texture Loaders ------------------------------------------------------------------------------------------
	const textureCube = new THREE.CubeTextureLoader(loadingManager).setPath("./static/").load([
		"right.png", "left.png",
		"top.png", "bottom.png",
		"front.png", "back.png"
	]);

	const solarMesh = createSolarCentre();
	solarMesh.position.z = 0;
	const solarLight = createSunLight();
	const galaxyLight = createGalaxyLight();
	const planetCache = await createPlanetsInOrbit(scene);

	let max = 0.005;
	let min = 0.001;
	for (let object = 0; object < 11; object++) {
		let planet = planetCache[object];
		planet["celestialWeight"] = Math.random() * (max-min) + min;
		
	}

	const {planetaryCurves, planetaryLines} = createPlanetaryOrbits();
	planets = planetCache;
	orbits = planetaryCurves;
	orbitLines = planetaryLines;

	var position = -3;

	for (let planetIndex = 0; planetIndex < planetCache.length; planetIndex++) {
		planetCache[planetIndex].position.z = position;
		position -= 2;
	}

	randomizeStartingOrbitPosition();

	systemView = new THREE.Vector3().copy(solarMesh.position);
	systemView.y += 110;

	// Scene construction
	scene.background = textureCube;
	scene.add(solarMesh);

	scene.add(solarLight);
	scene.add(galaxyLight);

	

	for (let l = 0; l < 11; l++) {
		scene.add(planetaryLines[l]);
	}
	

	// Add ThreeJS renderer to HTML
	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.autoClear = false;
	container.appendChild(renderer.domElement);

	// Add HTML Renderer to ThreeJS
	htmlRenderer = new CSS2DRenderer();
	htmlRenderer.setSize(window.innerWidth, window.innerHeight);
	htmlRenderer.domElement.style.position = "absolute";
	htmlRenderer.domElement.style.top = "0px";
	container.appendChild(htmlRenderer.domElement);

	// Set up HTML labels
	setHTMLLabels();

	// Post-Processing Settings ---------------------------------------------------------------------------------
	const renderModel = new RenderPass(scene, camera);
	//const effectBloom = new BloomPass(0.5);
	const outputPass = new OutputPass();

	composer = new EffectComposer(renderer);
	composer.addPass(renderModel);
	//composer.addPass(effectBloom);
	composer.addPass(outputPass);

	// Window Settings ------------------------------------------------------------------------------------------
	window.addEventListener( 'resize', onWindowResize );
	
	

	renderer.setAnimationLoop( animate );

	cameraIndex = -1;
	look = false;
}

// Window & Camera Functions --------------------------------------------------------------------------------
function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize( window.innerWidth, window.innerHeight );
	composer.setSize( window.innerWidth, window.innerHeight );

}

function scrollCamera(scrollingDown) {
	if (cameraIndex < 0) {
		startingLabel.element.remove();
	}

	// Hide previous html elements
	cameraIndex = scrollingDown ? modulus((cameraIndex+1), 5) : modulus((cameraIndex-1), 5);
	let previousIndex = scrollingDown ? modulus((cameraIndex-1), 5) : modulus((cameraIndex+1), 5);

	if (previousIndex !== 4) {
		htmlLabels[previousIndex].element.style.display = "none";
	} else {
		endingLabel.element.style.display = "none";
	}
	renderedLabel = false;
	look = true;
}

// Main Loop ------------------------------------------------------------------------------------------------
function animate() {
	const delta = 5 * clock.getDelta();

	solarUniforms["time"].value += 0.2 * delta;

	solarMesh.rotation.x += 0.05 * delta;
	solarMesh.rotation.y += 0.0125 * delta;

	orbit();

	focusMove();

	focusLook();

	labelRender();

	renderer.clear();
	composer.render(0.01);
	htmlRenderer.render(scene, camera);
}

function orbit() {

	for (let index = 0; index < 11; index++) {
		let curve = orbits[index];
		let planet = planets[index];
		let line = orbitLines[index];

		if (planet && curve && line) {
			let startPosition = startingPositions[index];
			let celestialWeight = planet["celestialWeight"];

			let v = new THREE.Vector3();
			
			let time = (startPosition + (clock.getElapsedTime() * celestialWeight)) % 1;

			curve.getPointAt(time, v);

			planet.position.copy(v);
			planet.position.applyMatrix4(line.matrixWorld);
			//planet.lookAt(solarMesh.position);
		}
	}
	
	
}

function focusMove() {
	if (cameraIndex >= 0 && cameraIndex < 4) {
		let planet = planets[cameraIndex];

		let direction = new THREE.Vector3();

		let targetPosition = new THREE.Vector3();
		
		targetPosition.copy(planet.position);

		direction.subVectors(solarMesh.position, planet.position).normalize();

		camera.position.lerp(targetPosition.add(direction.multiplyScalar(2)), 0.01);
	} else if (cameraIndex === 4) {
		camera.position.lerp(systemView, 0.01);
	}
}

function focusLook() {
	if (look) {
		let target = (cameraIndex < 4) ? planets[cameraIndex] : solarMesh;

		startQuaternion = camera.quaternion.clone();
		camera.lookAt(target.position);
		targetQuaternion = camera.quaternion.clone();
		camera.quaternion.copy(startQuaternion);

		camera.quaternion.slerp(targetQuaternion, 0.1);
	}

}

function labelRender() {
	// Ensure close enough to planet
	if (renderedLabel) {
		return;
	}

	if (cameraIndex >= 0) {
		let target = (cameraIndex === 4) ? systemView : planets[cameraIndex].position;
		if (checkEpsilon(camera.position, target)) {
			
			let currentCSSObject = (cameraIndex !== 4) ? htmlLabels[cameraIndex] : endingLabel;

			currentCSSObject.element.style.display = "table";

			let maxCharacters = 0;
			var allTags = currentCSSObject.element.getElementsByTagName("p");
			for (var i = 0, len = allTags.length; i < len; i++) {
				allTags[i].style.maxWidth = (allTags[i].textContent.length) + "ch";

				if (allTags[i].textContent.length > maxCharacters) {
					maxCharacters = allTags[i].textContent.length;
				}

				if (i > 0) {
					allTags[i].style.animationDelay = (1+ i).toString() + "s";
				}
			}

			let widthMultiplier = (cameraIndex !== 4) ? (maxCharacters * 0.8).toString() + "rem" : "100%";

			currentCSSObject.element.children[0].style.width = widthMultiplier;
			
			renderedLabel = true;
		}
		
	}
}

// Helper Functions -----------------------------------------------------------------------------------------
function checkEpsilon(v, w) {
	let epsilon = 5;
	return ( ( Math.abs( v.x - w.x ) < epsilon ) && ( Math.abs( v.y - w.y ) < epsilon ) && ( Math.abs( v.z - w.z ) < epsilon ) );
}

function modulus(n, m) {
	return ((n % m) + m) % m;
}

function onTransitionEnd(event) {
	loadingLabel.innerHTML = "Loaded! :D"
	if (event.target.classList.contains("loading-fade-out")) {
		event.target.remove();
		startingLabel.element.style.display = "table";

		let maxCharacters = 0;
		var allTags = startingLabel.element.getElementsByTagName("p");
		allTags[0].style.maxWidth = (allTags[0].textContent.length) + "ch";
		if (allTags[0].textContent.length > maxCharacters) {
			maxCharacters = allTags[0].textContent.length;
		}
		allTags[0].style.animationDelay = "0s";


		startingLabel.element.children[0].style.width = "100%";

		addEventListener("wheel", function(event) {
			if (event.deltaY < 0) {
				console.log("scrolling up")
				scrollCamera(false);
			}

			else if (event.deltaY > 0) {
				console.log("scrolling down")
				scrollCamera(true);
			}
			
		});
	}
}

// Start Website --------------------------------------------------------------------------------------------
async function start() {
	vertexShader = await (await fetch("./shaders/solarVertexShader.glsl")).text();
	fragmentShader = await (await fetch("./shaders/solarFragmentShader.glsl")).text();

	await initialisation(); 
}

start();

