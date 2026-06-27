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
