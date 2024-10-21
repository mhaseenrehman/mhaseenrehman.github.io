varying vec2 vUv;

uniform sampler2D diffuse_texture;
// uniform sampler2D bump_texture;
// uniform sampler2D elevation_texture;
// uniform sampler2D clouds_texture;
// uniform sampler2D lights_texture;
// uniform sampler2D roughness_texture;

void main( void ) {
    vec4 fragColor = texture2D(diffuse_texture, vUv);
    gl_FragColor = 0.5*fragColor;
}