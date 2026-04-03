const fs = require('fs');
try {
    let s = fs.readFileSync('assets/BlankMap-Equirectangular.svg', 'utf8');
    
    // Scale up for 4K Vector Rasterization
    s = s.replace(/width="360"/g, 'width="4096"');
    s = s.replace(/height="180"/g, 'height="2048"');

    // Replace the .country class to add our #0a0e27 fill and distinct country borders
    s = s.replace(/\.country\s*\{[^}]+\}/g, '.country { fill:#0a0e27; stroke:#3182ce; stroke-width:0.2; }');

    // Make ocean background implicitly pitch black or transparent.
    // SVG has transparent by default, but we can append a massive rect just in case
    // s = s.replace(/<svg[^>]+>/, match => match + '\n<rect width="100%" height="100%" fill="#050814" />');

    fs.writeFileSync('assets/earth-dark.svg', s);
    console.log("Successfully compiled earth-dark.svg!");
} catch(e) {
    console.error(e);
    process.exit(1);
}
