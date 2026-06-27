import { AgentSkill } from './base';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 1. Frontend: Init Vite React
export const InitReactViteSkill: AgentSkill = {
    name: 'init_react_vite_app',
    description: 'Initializes a new React app using Vite (Frontend UI).',
    example: `<tool_call>\n{"action": "init_react_vite_app", "projectName": "my-app"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.projectName) return "Error: projectName is required";
        return new Promise((resolve) => {
            exec(`npx create-vite@latest ${args.projectName} --template react-ts`, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`React Vite app '${args.projectName}' created successfully.\\nNext steps: cd ${args.projectName} && npm install`);
            });
        });
    }
};

// 2. Frontend: Init Next.js
export const InitNextJsSkill: AgentSkill = {
    name: 'init_nextjs_app',
    description: 'Initializes a new Next.js Full-stack app.',
    example: `<tool_call>\n{"action": "init_nextjs_app", "projectName": "my-next-app"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.projectName) return "Error: projectName is required";
        return new Promise((resolve) => {
            exec(`npx create-next-app@latest ${args.projectName} --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm`, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`Next.js app '${args.projectName}' created successfully.`);
            });
        });
    }
};

// 3. Backend: Init Express API
export const InitExpressApiSkill: AgentSkill = {
    name: 'init_express_api',
    description: 'Scaffolds a basic Express.js backend project.',
    example: `<tool_call>\n{"action": "init_express_api", "folderName": "api"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.folderName) return "Error: folderName is required";
        const dir = path.join(process.cwd(), args.folderName);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: args.folderName, version: "1.0.0", main: "index.js", scripts: { start: "node index.js" }, dependencies: { express: "^4.18.2", cors: "^2.8.5" } }, null, 2));
        
        const code = `const express = require('express');\\nconst cors = require('cors');\\nconst app = express();\\napp.use(cors());\\napp.use(express.json());\\n\\napp.get('/', (req, res) => res.send({status: 'OK'}));\\n\\napp.listen(3001, () => console.log('API running on port 3001'));`;
        fs.writeFileSync(path.join(dir, 'index.js'), code);
        
        return `Express API scaffolded in folder '${args.folderName}'. Please run 'cd ${args.folderName} && npm install'.`;
    }
};

// 4. 3D Web: Init Three.js Scene
export const InitThreeJsSceneSkill: AgentSkill = {
    name: 'init_threejs_scene',
    description: 'Scaffolds a basic 3D website boilerplate using Three.js.',
    example: `<tool_call>\n{"action": "init_threejs_scene", "folderName": "3d-web"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.folderName) return "Error: folderName is required";
        const dir = path.join(process.cwd(), args.folderName);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: args.folderName, dependencies: { three: "^0.160.0", vite: "^5.0.0" }, scripts: { dev: "vite" } }, null, 2));
        
        fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html>\\n<html lang="en">\\n<head>\\n<style>body{margin:0;overflow:hidden;}</style>\\n</head>\\n<body>\\n<script type="module" src="./main.js"></script>\\n</body>\\n</html>`);
        
        const js = `import * as THREE from 'three';\\nconst scene = new THREE.Scene();\\nconst camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);\\nconst renderer = new THREE.WebGLRenderer();\\nrenderer.setSize(window.innerWidth, window.innerHeight);\\ndocument.body.appendChild(renderer.domElement);\\n\\nconst geometry = new THREE.BoxGeometry();\\nconst material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });\\nconst cube = new THREE.Mesh(geometry, material);\\nscene.add(cube);\\ncamera.position.z = 5;\\n\\nfunction animate() {\\n\\trequestAnimationFrame(animate);\\n\\tcube.rotation.x += 0.01;\\n\\tcube.rotation.y += 0.01;\\n\\trenderer.render(scene, camera);\\n}\\nanimate();`;
        fs.writeFileSync(path.join(dir, 'main.js'), js);
        
        return `3D Three.js boilerplate created in '${args.folderName}'. Run 'cd ${args.folderName} && npm install && npm run dev'.`;
    }
};

// 5. App: Init React Native Expo
export const InitReactNativeSkill: AgentSkill = {
    name: 'init_react_native_app',
    description: 'Initializes a mobile app using React Native Expo.',
    example: `<tool_call>\n{"action": "init_react_native_app", "projectName": "mobile-app"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.projectName) return "Error: projectName is required";
        return new Promise((resolve) => {
            exec(`npx create-expo-app ${args.projectName}`, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`Expo React Native App created successfully.`);
            });
        });
    }
};

// 6. UI/UX: Init Tailwind CSS
export const InitTailwindCssSkill: AgentSkill = {
    name: 'init_tailwind_css',
    description: 'Installs and configures Tailwind CSS in the current project.',
    example: `<tool_call>\n{"action": "init_tailwind_css"}\n</tool_call>`,
    execute: async () => {
        return new Promise((resolve) => {
            exec(`npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`Tailwind CSS initialized. Remember to configure tailwind.config.js and add directives to your CSS.`);
            });
        });
    }
};

// 7. Backend: Check API Health
export const CheckApiHealthSkill: AgentSkill = {
    name: 'check_api_health',
    description: 'Pings a local API endpoint to verify the backend is running properly.',
    example: `<tool_call>\n{"action": "check_api_health", "endpoint": "http://localhost:3000/api/health"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.endpoint) return "Error: endpoint is required";
        return new Promise((resolve) => {
            const http = args.endpoint.startsWith('https') ? require('https') : require('http');
            http.get(args.endpoint, (res: any) => {
                let data = '';
                res.on('data', (c: any) => data += c);
                res.on('end', () => resolve(`Status: ${res.statusCode}\\nResponse: ${data}`));
            }).on('error', (err: any) => resolve(`Health check failed: ${err.message}`));
        });
    }
};

// 8. 3D Web: Get GLTF Loader Snippet
export const GetGLTFLoaderSnippetSkill: AgentSkill = {
    name: 'get_gltf_loader_snippet',
    description: 'Returns the boilerplate code required to load a 3D model (.gltf / .glb) in Three.js.',
    example: `<tool_call>\n{"action": "get_gltf_loader_snippet"}\n</tool_call>`,
    execute: async () => {
        return `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';\n\nconst loader = new GLTFLoader();\nloader.load('path/to/model.glb', (gltf) => {\n  scene.add(gltf.scene);\n}, undefined, (error) => {\n  console.error('Error loading 3D model:', error);\n});`;
    }
};

// 9. UI/UX: Analyze Accessibility
export const AnalyzeUXAccessibilitySkill: AgentSkill = {
    name: 'analyze_ux_accessibility',
    description: 'Returns a checklist of UI/UX and accessibility best practices for the AI to review the code against.',
    example: `<tool_call>\n{"action": "analyze_ux_accessibility"}\n</tool_call>`,
    execute: async () => {
        return `UX/Accessibility Checklist:
1. ARIA labels on all icon buttons.
2. High contrast text (WCAG AAA).
3. Responsive viewport meta tag.
4. Semantic HTML (header, main, nav, footer).
5. Focus states for keyboard navigation.
6. Mobile touch target size (min 44x44px).
Please review your code against this checklist.`;
    }
};

// 10. Frontend: Setup Zustand State
export const SetupZustandSkill: AgentSkill = {
    name: 'setup_zustand_store',
    description: 'Creates a basic Zustand global state store file.',
    example: `<tool_call>\n{"action": "setup_zustand_store", "filePath": "./src/store.ts"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.filePath) return "Error: filePath is required";
        const dir = path.dirname(args.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const code = `import { create } from 'zustand';\n\ninterface AppState {\n  count: number;\n  increment: () => void;\n}\n\nexport const useStore = create<AppState>((set) => ({\n  count: 0,\n  increment: () => set((state) => ({ count: state.count + 1 })),\n}));`;
        fs.writeFileSync(args.filePath, code);
        return `Zustand store created at ${args.filePath}. Remember to 'npm install zustand'.`;
    }
};

// 11. Full-Stack: Generate Prisma Schema
export const GeneratePrismaSchemaSkill: AgentSkill = {
    name: 'generate_prisma_schema',
    description: 'Generates a boilerplate Prisma ORM schema for a PostgreSQL database.',
    example: `<tool_call>\n{"action": "generate_prisma_schema", "filePath": "./prisma/schema.prisma"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.filePath) return "Error: filePath is required";
        const dir = path.dirname(args.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const code = `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id    Int     @id @default(autoincrement())\n  email String  @unique\n  name  String?\n}`;
        fs.writeFileSync(args.filePath, code);
        return `Prisma schema created at ${args.filePath}. Remember to 'npm install prisma --save-dev'.`;
    }
};

// 12. Dev: Start Background Server
export const StartDevServerSkill: AgentSkill = {
    name: 'start_dev_server',
    description: 'Starts the development server (npm run dev) in the background without blocking the AI loop.',
    example: `<tool_call>\n{"action": "start_dev_server", "directory": "./my-app"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.directory) return "Error: directory is required";
        return new Promise((resolve) => {
            const child = exec(`npm run dev`, { cwd: args.directory });
            child.stdout?.on('data', (data) => {
                if (data.includes('Local:') || data.includes('localhost') || data.includes('ready')) {
                    resolve(`Dev server started successfully in ${args.directory}. Output: ${data}`);
                }
            });
            setTimeout(() => resolve(`Dev server assumed started after 3 seconds timeout.`), 3000);
        });
    }
};

// 13. DevOps: Generate Dockerfile
export const GenerateDockerfileSkill: AgentSkill = {
    name: 'generate_dockerfile',
    description: 'Generates a production-ready multi-stage Node.js Dockerfile and .dockerignore.',
    example: `<tool_call>\n{"action": "generate_dockerfile", "directory": "./"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.directory) return "Error: directory is required";
        const dockerignore = `node_modules\nnpm-debug.log\nbuild\ndist\n.env`;
        const dockerfile = `FROM node:18-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\n\nFROM node:18-alpine AS runner\nWORKDIR /app\nENV NODE_ENV production\nCOPY --from=builder /app/package*.json ./\nCOPY --from=builder /app/node_modules ./node_modules\nCOPY --from=builder /app/dist ./dist\nEXPOSE 3000\nCMD ["npm", "start"]`;
        fs.writeFileSync(path.join(args.directory, '.dockerignore'), dockerignore);
        fs.writeFileSync(path.join(args.directory, 'Dockerfile'), dockerfile);
        return `Production Dockerfile and .dockerignore generated successfully in ${args.directory}.`;
    }
};

// 14. CI/CD: Init GitHub Actions
export const InitGitHubActionsSkill: AgentSkill = {
    name: 'init_github_actions',
    description: 'Generates a basic CI/CD pipeline (ci.yml) for GitHub Actions (Node.js tests).',
    example: `<tool_call>\n{"action": "init_github_actions", "directory": "./"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.directory) return "Error: directory is required";
        const dir = path.join(args.directory, '.github', 'workflows');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const yml = `name: Node.js CI\n\non:\n  push:\n    branches: [ "main" ]\n  pull_request:\n    branches: [ "main" ]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n    - uses: actions/checkout@v3\n    - name: Use Node.js 18.x\n      uses: actions/setup-node@v3\n      with:\n        node-version: 18.x\n        cache: 'npm'\n    - run: npm ci\n    - run: npm run build --if-present\n    - run: npm test`;
        fs.writeFileSync(path.join(dir, 'ci.yml'), yml);
        return `GitHub Actions CI workflow generated at .github/workflows/ci.yml.`;
    }
};

// 15. Dev: Format Code (Prettier)
export const FormatCodePrettierSkill: AgentSkill = {
    name: 'format_code_prettier',
    description: 'Formats a file or directory using Prettier to enforce standard styling.',
    example: `<tool_call>\n{"action": "format_code_prettier", "target": "./src"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.target) return "Error: target path is required";
        return new Promise((resolve) => {
            exec(`npx prettier --write "${args.target}"`, (error, stdout, stderr) => {
                if (error) resolve(`Formatting failed: ${stderr || error.message}`);
                else resolve(`Successfully formatted ${args.target} using Prettier.\\n${stdout}`);
            });
        });
    }
};

// 16. Docs: Generate README
export const GenerateReadmeSkill: AgentSkill = {
    name: 'generate_readme',
    description: 'Generates a professional Markdown README.md boilerplate for the project.',
    example: `<tool_call>\n{"action": "generate_readme", "directory": "./", "projectName": "AwesomeApp"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.directory || !args.projectName) return "Error: directory and projectName are required";
        const readme = `# ${args.projectName}\n\n## Description\nA brief description of what this project does and who it's for.\n\n## Getting Started\n\n### Prerequisites\n- Node.js (v18+)\n- npm or yarn\n\n### Installation\n\`\`\`bash\nnpm install\n\`\`\`\n\n### Running the App\n\`\`\`bash\nnpm run dev\n\`\`\`\n\n## Tech Stack\n- Tech 1\n- Tech 2\n\n## License\nMIT`;
        fs.writeFileSync(path.join(args.directory, 'README.md'), readme);
        return `Professional README.md generated in ${args.directory}.`;
    }
};

// 17. UI/UX: Extract CSS Colors
export const ExtractCssColorsSkill: AgentSkill = {
    name: 'extract_css_colors',
    description: 'Parses a CSS file and extracts all hex and rgb colors. Extremely useful for AI to understand the current UI theme.',
    example: `<tool_call>\n{"action": "extract_css_colors", "filePath": "./src/index.css"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.filePath) return "Error: filePath is required";
        try {
            const css = fs.readFileSync(args.filePath, 'utf-8');
            const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
            const rgbRegex = /rgba?\([^)]+\)/g;
            const hexColors = [...new Set(css.match(hexRegex) || [])];
            const rgbColors = [...new Set(css.match(rgbRegex) || [])];
            return `Theme Colors found in ${args.filePath}:\nHex: ${hexColors.join(', ')}\nRGB/RGBA: ${rgbColors.join(', ')}`;
        } catch (e: any) {
            return `Failed to read CSS file: ${e.message}`;
        }
    }
};

// 18. Backend: Generate JWT Secret
export const GenerateJwtSecretSkill: AgentSkill = {
    name: 'generate_jwt_secret',
    description: 'Generates a secure 256-bit crypto string for use as a JWT_SECRET or SESSION_SECRET in backend apps.',
    example: `<tool_call>\n{"action": "generate_jwt_secret"}\n</tool_call>`,
    execute: async () => {
        const crypto = require('crypto');
        return `Secure Secret Key (Hex): ${crypto.randomBytes(32).toString('hex')}\\nSecure Secret Key (Base64): ${crypto.randomBytes(32).toString('base64')}`;
    }
};

// 19. Full-Stack: Generate SEO Meta Tags
export const GenerateSeoMetaTagsSkill: AgentSkill = {
    name: 'generate_seo_meta_tags',
    description: 'Returns a perfect HTML <head> snippet containing standard, OpenGraph, and Twitter SEO meta tags.',
    example: `<tool_call>\n{"action": "generate_seo_meta_tags"}\n</tool_call>`,
    execute: async () => {
        return `<!-- Primary Meta Tags -->
<title>App Title</title>
<meta name="title" content="App Title" />
<meta name="description" content="App description goes here." />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://example.com/" />
<meta property="og:title" content="App Title" />
<meta property="og:description" content="App description goes here." />
<meta property="og:image" content="https://example.com/cover.jpg" />

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:url" content="https://example.com/" />
<meta property="twitter:title" content="App Title" />
<meta property="twitter:description" content="App description goes here." />
<meta property="twitter:image" content="https://example.com/cover.jpg" />`;
    }
};

// 20. QA: Init Jest Testing
export const InitJestTestingSkill: AgentSkill = {
    name: 'init_jest_testing',
    description: 'Sets up Jest unit testing framework in a Node/React project.',
    example: `<tool_call>\n{"action": "init_jest_testing"}\n</tool_call>`,
    execute: async () => {
        return new Promise((resolve) => {
            exec(`npm install -D jest @types/jest ts-jest && npx ts-jest config:init`, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`Jest initialized successfully. A jest.config.js has been created. Remember to add "test": "jest" to your package.json scripts.`);
            });
        });
    }
};

// 21. Git: Init and Commit
export const GitInitAndCommitSkill: AgentSkill = {
    name: 'git_init_and_commit',
    description: 'Initializes a git repository, stages all files, and makes the first initial commit automatically.',
    example: `<tool_call>\n{"action": "git_init_and_commit", "directory": "./"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.directory) return "Error: directory is required";
        return new Promise((resolve) => {
            exec(`git init && git add . && git commit -m "Initial commit by ATCLI"`, { cwd: args.directory }, (error, stdout, stderr) => {
                if (error) resolve(`Failed: ${stderr || error.message}`);
                else resolve(`Git initialized and first commit created successfully.\\n${stdout}`);
            });
        });
    }
};

// 22. UI/UX: Generate SVG Placeholder
export const GenerateSvgPlaceholderSkill: AgentSkill = {
    name: 'generate_svg_placeholder',
    description: 'Generates a base64 encoded SVG placeholder image string that can be used directly in <img> src. Useful for UI mockups.',
    example: `<tool_call>\n{"action": "generate_svg_placeholder", "width": 800, "height": 600, "text": "Mockup"}\n</tool_call>`,
    execute: async (args: any) => {
        const width = args.width || 800;
        const height = args.height || 600;
        const text = args.text || `${width}x${height}`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#cccccc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24px" fill="#666666">${text}</text></svg>`;
        const b64 = Buffer.from(svg).toString('base64');
        return `data:image/svg+xml;base64,${b64}`;
    }
};
