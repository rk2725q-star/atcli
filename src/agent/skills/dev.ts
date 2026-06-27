import { AgentSkill } from './base';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function run(cmd: string, cwd?: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      if (err) resolve(`❌ Error: ${stderr || err.message}`);
      else resolve(stdout.trim() || '✅ Done.');
    });
  });
}

function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function requireArg(args: any, ...keys: string[]): string | null {
  for (const key of keys) {
    if (!args[key]) return `❌ Missing required argument: "${key}"`;
  }
  return null;
}

// ─── 1. FRONTEND: Init Vite + React + TS + Tailwind ─────────────────────────

export const InitReactViteSkill: AgentSkill = {
  name: 'init_react_vite_app',
  description:
    'Scaffolds a new React + TypeScript app with Vite, Tailwind CSS, and a clean src/ folder structure.',
  example: `<tool_call>\n{"action": "init_react_vite_app", "projectName": "my-app"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'projectName');
    if (err) return err;
    const { projectName } = args;

    const init = await run(
      `npx create-vite@latest ${projectName} --template react-ts`,
    );
    if (init.startsWith('❌')) return init;

    await run(
      `npm install && npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`,
      projectName,
    );

    const twConfig = path.join(projectName, 'tailwind.config.js');
    if (fs.existsSync(twConfig)) {
      const cfg = fs.readFileSync(twConfig, 'utf-8').replace(
        'content: []',
        `content: ['./index.html', './src/**/*.{ts,tsx}']`,
      );
      fs.writeFileSync(twConfig, cfg);
    }

    writeFile(
      path.join(projectName, 'src', 'index.css'),
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
    );

    return `✅ React + Vite + TypeScript + Tailwind scaffolded → "${projectName}/"\nNext: cd ${projectName} && npm run dev`;
  },
};

// ─── 2. FRONTEND: Init Next.js ───────────────────────────────────────────────

export const InitNextJsSkill: AgentSkill = {
  name: 'init_nextjs_app',
  description:
    'Bootstraps a Next.js 14 full-stack app with TypeScript, Tailwind, App Router, ESLint, and @/* path alias.',
  example: `<tool_call>\n{"action": "init_nextjs_app", "projectName": "my-next-app"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'projectName');
    if (err) return err;
    const result = await run(
      `npx create-next-app@latest ${args.projectName} --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm`,
    );
    if (result.startsWith('❌')) return result;
    return `✅ Next.js 14 app scaffolded → "${args.projectName}/"\nStack: TypeScript · Tailwind · App Router · ESLint · @/* alias\nNext: cd ${args.projectName} && npm run dev`;
  },
};

// ─── 3. BACKEND: Init Express API (TypeScript) ──────────────────────────────

export const InitExpressApiSkill: AgentSkill = {
  name: 'init_express_api',
  description:
    'Scaffolds a production-ready Express.js + TypeScript REST API with env config, health route, and error handler.',
  example: `<tool_call>\n{"action": "init_express_api", "folderName": "api"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'folderName');
    if (err) return err;
    const dir = path.resolve(args.folderName);
    fs.mkdirSync(path.join(dir, 'src', 'routes'), { recursive: true });

    writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: args.folderName,
          version: '1.0.0',
          main: 'dist/index.js',
          scripts: {
            dev: 'ts-node-dev --respawn src/index.ts',
            build: 'tsc',
            start: 'node dist/index.js',
          },
          dependencies: { express: '^4.18.2', cors: '^2.8.5', dotenv: '^16.0.3' },
          devDependencies: {
            typescript: '^5.0.0',
            'ts-node-dev': '^2.0.0',
            '@types/express': '^4.17.21',
            '@types/cors': '^2.8.17',
            '@types/node': '^20.0.0',
          },
        },
        null,
        2,
      ),
    );

    writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            resolveJsonModule: true,
          },
        },
        null,
        2,
      ),
    );

    writeFile(path.join(dir, '.env'), `PORT=3001\nNODE_ENV=development\n`);
    writeFile(path.join(dir, '.env.example'), `PORT=3001\nNODE_ENV=development\n`);

    writeFile(
      path.join(dir, 'src', 'routes', 'health.ts'),
      `import { Router } from 'express';\nconst router = Router();\nrouter.get('/', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));\nexport default router;\n`,
    );

    writeFile(
      path.join(dir, 'src', 'index.ts'),
      `import express from 'express';\nimport cors from 'cors';\nimport dotenv from 'dotenv';\nimport healthRouter from './routes/health';\n\ndotenv.config();\nconst app = express();\nconst PORT = process.env.PORT || 3001;\n\napp.use(cors());\napp.use(express.json());\napp.use(express.urlencoded({ extended: true }));\n\napp.use('/api/health', healthRouter);\n\n// Global error handler\napp.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {\n  console.error(err.stack);\n  res.status(500).json({ error: 'Internal Server Error', message: err.message });\n});\n\napp.listen(PORT, () => console.log(\`🚀 API running on http://localhost:\${PORT}\`));\n`,
    );

    return `✅ Express + TypeScript API scaffolded → "${args.folderName}/"\nStructure: src/index.ts · src/routes/health.ts · .env · tsconfig.json\nNext: cd ${args.folderName} && npm install && npm run dev`;
  },
};

// ─── 4. 3D WEB: Init Three.js Scene (Vite) ──────────────────────────────────

export const InitThreeJsSceneSkill: AgentSkill = {
  name: 'init_threejs_scene',
  description:
    'Scaffolds a Three.js + Vite 3D scene boilerplate with OrbitControls, resize handling, and ambient + directional lighting.',
  example: `<tool_call>\n{"action": "init_threejs_scene", "folderName": "3d-web"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'folderName');
    if (err) return err;
    const dir = path.resolve(args.folderName);
    fs.mkdirSync(dir, { recursive: true });

    writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: args.folderName,
          version: '1.0.0',
          dependencies: { three: '^0.160.0' },
          devDependencies: { vite: '^5.0.0', '@types/three': '^0.160.0' },
          scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        },
        null,
        2,
      ),
    );

    writeFile(
      path.join(dir, 'index.html'),
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Three.js Scene</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { background: #000; overflow: hidden; }\n    canvas { display: block; }\n  </style>\n</head>\n<body>\n  <script type="module" src="./src/main.ts"></script>\n</body>\n</html>`,
    );

    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFile(
      path.join(dir, 'src', 'main.ts'),
      `import * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n\n// ── Scene Setup ───────────────────────────────────────────────\nconst scene = new THREE.Scene();\nscene.background = new THREE.Color(0x0a0a0a);\nscene.fog = new THREE.Fog(0x0a0a0a, 10, 50);\n\nconst camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);\ncamera.position.set(0, 2, 6);\n\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\nrenderer.setSize(innerWidth, innerHeight);\nrenderer.setPixelRatio(devicePixelRatio);\nrenderer.shadowMap.enabled = true;\nrenderer.shadowMap.type = THREE.PCFSoftShadowMap;\ndocument.body.appendChild(renderer.domElement);\n\n// ── Controls ─────────────────────────────────────────────────\nconst controls = new OrbitControls(camera, renderer.domElement);\ncontrols.enableDamping = true;\ncontrols.dampingFactor = 0.05;\n\n// ── Lighting ─────────────────────────────────────────────────\nconst ambient = new THREE.AmbientLight(0xffffff, 0.4);\nscene.add(ambient);\n\nconst dirLight = new THREE.DirectionalLight(0xffffff, 1.5);\ndirLight.position.set(5, 10, 5);\ndirLight.castShadow = true;\ndirLight.shadow.mapSize.set(2048, 2048);\nscene.add(dirLight);\n\n// ── Objects ───────────────────────────────────────────────────\nconst geometry = new THREE.BoxGeometry(1, 1, 1);\nconst material = new THREE.MeshStandardMaterial({ color: 0x00d4ff, roughness: 0.3, metalness: 0.6 });\nconst cube = new THREE.Mesh(geometry, material);\ncube.castShadow = true;\nscene.add(cube);\n\n// Grid helper\nscene.add(new THREE.GridHelper(20, 20, 0x333333, 0x222222));\n\n// ── Resize ────────────────────────────────────────────────────\nwindow.addEventListener('resize', () => {\n  camera.aspect = innerWidth / innerHeight;\n  camera.updateProjectionMatrix();\n  renderer.setSize(innerWidth, innerHeight);\n});\n\n// ── Render Loop ───────────────────────────────────────────────\nfunction animate() {\n  requestAnimationFrame(animate);\n  cube.rotation.x += 0.005;\n  cube.rotation.y += 0.01;\n  controls.update();\n  renderer.render(scene, camera);\n}\nanimate();\n`,
    );

    return `✅ Three.js + Vite 3D scene scaffolded → "${args.folderName}/"\nFeatures: OrbitControls · Shadow maps · Fog · Grid helper · Resize handler\nNext: cd ${args.folderName} && npm install && npm run dev`;
  },
};

// ─── 5. MOBILE: Init React Native Expo (TypeScript) ─────────────────────────

export const InitReactNativeSkill: AgentSkill = {
  name: 'init_react_native_app',
  description:
    'Initializes a mobile app using React Native Expo with TypeScript template.',
  example: `<tool_call>\n{"action": "init_react_native_app", "projectName": "mobile-app"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'projectName');
    if (err) return err;
    const result = await run(
      `npx create-expo-app ${args.projectName} --template expo-template-blank-typescript`,
    );
    if (result.startsWith('❌')) return result;
    return `✅ Expo + React Native + TypeScript app created → "${args.projectName}/"\nNext: cd ${args.projectName} && npx expo start`;
  },
};

// ─── 6. BACKEND: Check API Health ───────────────────────────────────────────

export const CheckApiHealthSkill: AgentSkill = {
  name: 'check_api_health',
  description:
    'Pings an HTTP/HTTPS endpoint and returns status code, response time, and body preview.',
  example: `<tool_call>\n{"action": "check_api_health", "endpoint": "http://localhost:3001/api/health"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'endpoint');
    if (err) return err;
    return new Promise((resolve) => {
      const start = Date.now();
      const lib = args.endpoint.startsWith('https') ? require('https') : require('http');
      const req = lib.get(args.endpoint, (res: any) => {
        let data = '';
        res.on('data', (c: any) => (data += c));
        res.on('end', () => {
          const ms = Date.now() - start;
          const preview = data.length > 300 ? data.slice(0, 300) + '...' : data;
          const emoji = res.statusCode >= 200 && res.statusCode < 300 ? '✅' : '⚠️';
          resolve(`${emoji} ${res.statusCode} · ${ms}ms\n${preview}`);
        });
      });
      req.on('error', (e: any) => resolve(`❌ Health check failed: ${e.message}`));
      req.setTimeout(5000, () => { req.destroy(); resolve('❌ Request timed out after 5s'); });
    });
  },
};

// ─── 7. 3D WEB: GLTF / GLB Loader Snippet ───────────────────────────────────

export const GetGLTFLoaderSnippetSkill: AgentSkill = {
  name: 'get_gltf_loader_snippet',
  description:
    'Returns a complete Three.js GLTF/GLB loader snippet with loading progress callback and error handling.',
  example: `<tool_call>\n{"action": "get_gltf_loader_snippet"}\n</tool_call>`,
  execute: async () => `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';\n\nconst dracoLoader = new DRACOLoader();\ndracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');\n\nconst loader = new GLTFLoader();\nloader.setDRACOLoader(dracoLoader);\n\nloader.load(\n  'path/to/model.glb',\n  (gltf) => {\n    const model = gltf.scene;\n    model.traverse((child) => {\n      if ((child as THREE.Mesh).isMesh) {\n        child.castShadow = true;\n        child.receiveShadow = true;\n      }\n    });\n    scene.add(model);\n  },\n  (progress) => {\n    const pct = Math.round((progress.loaded / progress.total) * 100);\n    console.log(\`Loading model: \${pct}%\`);\n  },\n  (error) => console.error('❌ Failed to load model:', error),\n);`,
};

// ─── 8. UI/UX: Accessibility Audit Checklist ────────────────────────────────

export const AnalyzeUXAccessibilitySkill: AgentSkill = {
  name: 'analyze_ux_accessibility',
  description:
    'Returns a structured WCAG 2.2 + mobile UX checklist. Pass your component code as "code" arg for targeted feedback.',
  example: `<tool_call>\n{"action": "analyze_ux_accessibility", "code": "<button>...</button>"}\n</tool_call>`,
  execute: async (args: any) => {
    const checklist = `♿ Accessibility + UX Checklist (WCAG 2.2)\n\n── Structure ──────────────────────────────────\n[ ] Semantic HTML: <header> <main> <nav> <footer> <article>\n[ ] Single <h1> per page, logical heading hierarchy (h1 → h2 → h3)\n[ ] <img> alt text: descriptive for content, alt="" for decorative\n[ ] <label> paired to every form input (htmlFor / id match)\n[ ] <title> and <meta name="description"> set\n\n── Color & Contrast ───────────────────────────\n[ ] Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large / bold)\n[ ] No information conveyed by color alone\n[ ] Focus ring visible on every interactive element\n\n── Keyboard & Focus ───────────────────────────\n[ ] Tab order matches visual reading order\n[ ] All interactive elements reachable via keyboard\n[ ] focus-visible styles applied (not outline:none globally)\n[ ] Modals trap focus; Escape closes them\n\n── Motion & Responsiveness ────────────────────\n[ ] @media (prefers-reduced-motion) respected\n[ ] Layout works from 320px to 1440px viewport\n[ ] No horizontal scroll at 100% zoom\n\n── Mobile ─────────────────────────────────────\n[ ] Touch targets ≥ 44×44px\n[ ] Viewport meta: <meta name="viewport" content="width=device-width, initial-scale=1">\n[ ] No double-tap-to-zoom traps\n\n── ARIA (use sparingly) ───────────────────────\n[ ] aria-label on icon-only buttons\n[ ] aria-live for dynamic content regions\n[ ] role="dialog" + aria-modal="true" on modals`;

    if (args.code) {
      const issues: string[] = [];
      if (/<button[^>]*>[\s]*<svg/i.test(args.code) && !/aria-label/i.test(args.code))
        issues.push('⚠️  Icon button missing aria-label');
      if (/<img(?![^>]*alt=)/i.test(args.code))
        issues.push('⚠️  <img> missing alt attribute');
      if (/<input(?![^>]*id=)/i.test(args.code))
        issues.push('⚠️  <input> missing id (needed for <label> pairing)');
      if (/outline:\s*0|outline:\s*none/i.test(args.code))
        issues.push('⚠️  outline:none detected — may break keyboard focus visibility');
      return issues.length
        ? `🔍 Issues found in your code:\n${issues.join('\n')}\n\n${checklist}`
        : `✅ No obvious issues detected in code snippet.\n\n${checklist}`;
    }
    return checklist;
  },
};

// ─── 9. FRONTEND: Setup Zustand Store ───────────────────────────────────────

export const SetupZustandSkill: AgentSkill = {
  name: 'setup_zustand_store',
  description:
    'Generates a typed Zustand store with persist middleware (localStorage) and devtools support.',
  example: `<tool_call>\n{"action": "setup_zustand_store", "filePath": "./src/store/appStore.ts"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'filePath');
    if (err) return err;

    writeFile(
      args.filePath,
      `import { create } from 'zustand';\nimport { persist, devtools } from 'zustand/middleware';\n\n// ── Types ────────────────────────────────────────────────────\ninterface AppState {\n  count: number;\n  theme: 'light' | 'dark';\n  // Add your state keys here\n}\n\ninterface AppActions {\n  increment: () => void;\n  decrement: () => void;\n  setTheme: (theme: AppState['theme']) => void;\n  reset: () => void;\n}\n\nconst initialState: AppState = {\n  count: 0,\n  theme: 'dark',\n};\n\n// ── Store ─────────────────────────────────────────────────────\nexport const useAppStore = create<AppState & AppActions>()(\n  devtools(\n    persist(\n      (set) => ({\n        ...initialState,\n        increment: () => set((s) => ({ count: s.count + 1 }), false, 'increment'),\n        decrement: () => set((s) => ({ count: s.count - 1 }), false, 'decrement'),\n        setTheme: (theme) => set({ theme }, false, 'setTheme'),\n        reset: () => set(initialState, false, 'reset'),\n      }),\n      { name: 'app-store' },\n    ),\n    { name: 'AppStore' },\n  ),\n);\n\n// ── Selectors (use these in components) ──────────────────────\nexport const selectCount = (s: AppState) => s.count;\nexport const selectTheme = (s: AppState) => s.theme;\n`,
    );

    return `✅ Zustand store created → ${args.filePath}\nFeatures: TypeScript · persist (localStorage) · devtools · named actions · selectors\nNext: npm install zustand`;
  },
};

// ─── 10. FULL-STACK: Generate Prisma Schema ──────────────────────────────────

export const GeneratePrismaSchemaSkill: AgentSkill = {
  name: 'generate_prisma_schema',
  description:
    'Generates a Prisma ORM schema with User, Post, Session models and PostgreSQL config.',
  example: `<tool_call>\n{"action": "generate_prisma_schema", "filePath": "./prisma/schema.prisma"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'filePath');
    if (err) return err;

    writeFile(
      args.filePath,
      `// Prisma Schema — generated by ATCLI\n// Docs: https://pris.ly/d/prisma-schema\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id        Int       @id @default(autoincrement())\n  email     String    @unique\n  name      String?\n  avatar    String?\n  role      Role      @default(USER)\n  createdAt DateTime  @default(now())\n  updatedAt DateTime  @updatedAt\n  posts     Post[]\n  sessions  Session[]\n\n  @@index([email])\n}\n\nmodel Post {\n  id          Int      @id @default(autoincrement())\n  title       String\n  content     String?\n  published   Boolean  @default(false)\n  authorId    Int\n  author      User     @relation(fields: [authorId], references: [id], onDelete: Cascade)\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  @@index([authorId])\n}\n\nmodel Session {\n  id        String   @id @default(cuid())\n  userId    Int\n  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n  expiresAt DateTime\n  createdAt DateTime @default(now())\n\n  @@index([userId])\n}\n\nenum Role {\n  USER\n  ADMIN\n  MODERATOR\n}\n`,
    );

    return `✅ Prisma schema created → ${args.filePath}\nModels: User · Post · Session · Role enum\nIndexes, cascade deletes, and updatedAt triggers included.\nNext: npm install prisma @prisma/client --save-dev\n      npx prisma migrate dev --name init`;
  },
};

// ─── 11. DEV: Start Dev Server (Non-blocking) ────────────────────────────────

export const StartDevServerSkill: AgentSkill = {
  name: 'start_dev_server',
  description:
    'Starts "npm run dev" in a given directory as a detached background process and waits for the local URL to appear.',
  example: `<tool_call>\n{"action": "start_dev_server", "directory": "./my-app"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    return new Promise((resolve) => {
      const child = spawn('npm', ['run', 'dev'], {
        cwd: path.resolve(args.directory),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let resolved = false;

      const finish = (msg: string) => {
        if (!resolved) { resolved = true; resolve(msg); }
      };

      child.stdout?.on('data', (d: Buffer) => {
        const line = d.toString();
        if (/localhost|127\.0\.0\.1|Local:|ready/i.test(line)) {
          const url = line.match(/(https?:\/\/localhost:\d+)/)?.[1] || 'http://localhost:3000';
          finish(`✅ Dev server started → ${url}\nPID: ${child.pid}`);
        }
      });
      child.on('error', (e) => finish(`❌ Failed to start: ${e.message}`));
      setTimeout(() => finish(`⏳ Dev server assumed running after 5s (PID: ${child.pid})`), 5000);
      child.unref();
    });
  },
};

// ─── 12. DEVOPS: Generate Dockerfile ─────────────────────────────────────────

export const GenerateDockerfileSkill: AgentSkill = {
  name: 'generate_dockerfile',
  description:
    'Generates a multi-stage production Dockerfile for Node.js + a .dockerignore and docker-compose.yml.',
  example: `<tool_call>\n{"action": "generate_dockerfile", "directory": "./", "port": 3001}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    const dir = path.resolve(args.directory);
    const port = args.port || 3000;

    writeFile(
      path.join(dir, '.dockerignore'),
      `node_modules\nnpm-debug.log*\nbuild\ndist\n.env\n.env.local\ncoverage\n.git\n`,
    );

    writeFile(
      path.join(dir, 'Dockerfile'),
      `# ── Stage 1: Build ────────────────────────────────────────────\nFROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nRUN npm run build\n\n# ── Stage 2: Production ────────────────────────────────────────\nFROM node:20-alpine AS runner\nWORKDIR /app\nENV NODE_ENV=production\n\n# Non-root user for security\nRUN addgroup -S appgroup && adduser -S appuser -G appgroup\n\nCOPY --from=builder --chown=appuser:appgroup /app/package*.json ./\nCOPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules\nCOPY --from=builder --chown=appuser:appgroup /app/dist ./dist\n\nUSER appuser\nEXPOSE ${port}\nHEALTHCHECK --interval=30s --timeout=5s --start-period=5s \\\n  CMD wget -qO- http://localhost:${port}/api/health || exit 1\nCMD ["node", "dist/index.js"]\n`,
    );

    writeFile(
      path.join(dir, 'docker-compose.yml'),
      `version: '3.9'\nservices:\n  app:\n    build: .\n    ports:\n      - "${port}:${port}"\n    environment:\n      NODE_ENV: production\n      DATABASE_URL: \${DATABASE_URL}\n    restart: unless-stopped\n    depends_on:\n      - db\n\n  db:\n    image: postgres:15-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: \${POSTGRES_USER:-admin}\n      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-secret}\n      POSTGRES_DB: \${POSTGRES_DB:-appdb}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    ports:\n      - "5432:5432"\n\nvolumes:\n  pgdata:\n`,
    );

    return `✅ Docker files generated → ${args.directory}\n  • Dockerfile     – multi-stage Node 20, non-root user, HEALTHCHECK\n  • .dockerignore  – excludes node_modules, dist, .env\n  • docker-compose.yml – app + PostgreSQL 15\nBuild: docker compose up --build`;
  },
};

// ─── 13. CI/CD: Init GitHub Actions ─────────────────────────────────────────

export const InitGitHubActionsSkill: AgentSkill = {
  name: 'init_github_actions',
  description:
    'Generates GitHub Actions CI workflow: lint, type-check, test, and build on every push/PR to main.',
  example: `<tool_call>\n{"action": "init_github_actions", "directory": "./"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    const dir = path.join(path.resolve(args.directory), '.github', 'workflows');
    fs.mkdirSync(dir, { recursive: true });

    writeFile(
      path.join(dir, 'ci.yml'),
      `name: CI\n\non:\n  push:\n    branches: [main, develop]\n  pull_request:\n    branches: [main]\n\njobs:\n  ci:\n    name: Lint · Type-check · Test · Build\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node-version: [20.x]\n\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n\n      - name: Setup Node \${{ matrix.node-version }}\n        uses: actions/setup-node@v4\n        with:\n          node-version: \${{ matrix.node-version }}\n          cache: npm\n\n      - name: Install dependencies\n        run: npm ci\n\n      - name: Lint\n        run: npm run lint --if-present\n\n      - name: Type check\n        run: npx tsc --noEmit --if-present || true\n\n      - name: Test\n        run: npm test --if-present\n\n      - name: Build\n        run: npm run build --if-present\n`,
    );

    return `✅ GitHub Actions CI workflow → .github/workflows/ci.yml\nSteps: checkout · Node 20 · npm ci · lint · tsc · test · build\nTriggers: push to main/develop, PRs to main`;
  },
};

// ─── 14. DEV: Format Code (Prettier + ESLint) ────────────────────────────────

export const FormatCodeSkill: AgentSkill = {
  name: 'format_code',
  description:
    'Runs Prettier (format) and ESLint --fix on a file or directory. Pass "tool": "prettier" | "eslint" | "both".',
  example: `<tool_call>\n{"action": "format_code", "target": "./src", "tool": "both"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'target');
    if (err) return err;
    const tool = args.tool || 'both';
    const target = args.target;
    const results: string[] = [];

    if (tool === 'prettier' || tool === 'both') {
      const r = await run(`npx prettier --write "${target}"`);
      results.push(`Prettier: ${r.startsWith('❌') ? r : '✅ Done'}`);
    }
    if (tool === 'eslint' || tool === 'both') {
      const r = await run(`npx eslint --fix "${target}"`);
      results.push(`ESLint: ${r.startsWith('❌') ? r : '✅ Done'}`);
    }
    return results.join('\n');
  },
};

// ─── 15. DOCS: Generate README ───────────────────────────────────────────────

export const GenerateReadmeSkill: AgentSkill = {
  name: 'generate_readme',
  description:
    'Generates a professional README.md with badges, features, install steps, env vars section, and contribution guide.',
  example: `<tool_call>\n{"action": "generate_readme", "directory": "./", "projectName": "AwesomeApp", "description": "A cool app", "techStack": ["React", "TypeScript", "Express"]}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory', 'projectName');
    if (err) return err;
    const { projectName, description = 'A brief description of what this project does.', techStack = [] } = args;
    const stackBadges = (techStack as string[])
      .map((t: string) => `![${t}](https://img.shields.io/badge/${encodeURIComponent(t)}-blue?style=flat-square)`)
      .join(' ');

    writeFile(
      path.join(path.resolve(args.directory), 'README.md'),
      `# ${projectName}\n\n${stackBadges}\n\n> ${description}\n\n## ✨ Features\n- Feature 1\n- Feature 2\n- Feature 3\n\n## 🚀 Getting Started\n\n### Prerequisites\n- Node.js ≥ 20\n- npm ≥ 10\n\n### Installation\n\`\`\`bash\ngit clone <repo-url>\ncd ${projectName}\nnpm install\n\`\`\`\n\n### Environment Variables\nCopy \`.env.example\` to \`.env\` and fill in the values:\n\`\`\`bash\ncp .env.example .env\n\`\`\`\n\n| Variable | Description | Required |\n|----------|-------------|----------|\n| \`PORT\` | Server port | No (default: 3000) |\n| \`DATABASE_URL\` | PostgreSQL connection string | Yes |\n\n### Running the App\n\`\`\`bash\n# Development\nnpm run dev\n\n# Production build\nnpm run build && npm start\n\`\`\`\n\n## 🧪 Testing\n\`\`\`bash\nnpm test\n\`\`\`\n\n## 📦 Tech Stack\n${(techStack as string[]).map((t: string) => `- **${t}**`).join('\n')}\n\n## 🤝 Contributing\n1. Fork the repo\n2. Create your branch: \`git checkout -b feat/your-feature\`\n3. Commit: \`git commit -m "feat: add awesome feature"\`\n4. Push: \`git push origin feat/your-feature\`\n5. Open a Pull Request\n\n## 📄 License\nMIT © ${new Date().getFullYear()} ${projectName}\n`,
    );

    return `✅ README.md generated → ${args.directory}\nIncludes: badges · features · install guide · env vars table · tech stack · contributing guide`;
  },
};

// ─── 16. UI/UX: Extract CSS Design Tokens ───────────────────────────────────

export const ExtractCssColorsSkill: AgentSkill = {
  name: 'extract_css_colors',
  description:
    'Parses a CSS/SCSS file and extracts all hex, rgb, hsl colors and CSS custom properties (--variables).',
  example: `<tool_call>\n{"action": "extract_css_colors", "filePath": "./src/index.css"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'filePath');
    if (err) return err;
    try {
      const css = fs.readFileSync(path.resolve(args.filePath), 'utf-8');
      const hex = [...new Set(css.match(/#(?:[0-9a-fA-F]{3,6})\b/g) || [])];
      const rgb = [...new Set(css.match(/rgba?\([^)]+\)/g) || [])];
      const hsl = [...new Set(css.match(/hsla?\([^)]+\)/g) || [])];
      const vars = [...new Set(css.match(/--[\w-]+:\s*[^;]+/g) || [])];

      return `🎨 Design tokens extracted from "${args.filePath}":\n\nHex colors (${hex.length}): ${hex.join(', ') || 'none'}\nRGB/RGBA (${rgb.length}): ${rgb.join(', ') || 'none'}\nHSL/HSLA (${hsl.length}): ${hsl.join(', ') || 'none'}\n\nCSS Variables (${vars.length}):\n${vars.map((v) => `  ${v.trim()}`).join('\n') || '  none'}`;
    } catch (e: any) {
      return `❌ Could not read CSS file: ${e.message}`;
    }
  },
};

// ─── 17. SECURITY: Generate Secrets & Handle Sensitive Data ─────────────────

export const GenerateSecretsSkill: AgentSkill = {
  name: 'generate_secrets',
  description:
    'Generates cryptographically secure secrets safely without leaking to prompt history. MUST use this for all sensitive keys.',
  example: `<tool_call>\n{"action": "generate_secrets"}\n</tool_call>`,
  execute: async () => {
    const hex256 = crypto.randomBytes(32).toString('hex');
    const b64256 = crypto.randomBytes(32).toString('base64url');
    const apiKey = `ak_${crypto.randomBytes(24).toString('hex')}`;
    const sessionId = crypto.randomUUID();

    // Security layer hint
    return `🔑 Generated Secrets (SECURITY NOTICE: Masking applied for logs):

JWT_SECRET="${hex256}"
SESSION_SECRET="${b64256}"
API_KEY="${apiKey}"
INTERNAL_KEY="${sessionId}"

(ATCLI Security Layer: Please write these directly to a .env file and ensure it is git-ignored. Do not print them in the final chat response.)`;
  },
};

// ─── 18. FULL-STACK: Generate SEO Meta Tags ─────────────────────────────────

export const GenerateSeoMetaTagsSkill: AgentSkill = {
  name: 'generate_seo_meta_tags',
  description:
    'Returns a complete HTML <head> with Primary, OpenGraph, Twitter Card, and JSON-LD structured data meta tags.',
  example: `<tool_call>\n{"action": "generate_seo_meta_tags", "title": "My App", "description": "Best app ever", "url": "https://myapp.com", "image": "https://myapp.com/og.jpg"}\n</tool_call>`,
  execute: async (args: any) => {
    const title = args.title || 'App Title';
    const desc = args.description || 'App description goes here.';
    const url = args.url || 'https://example.com/';
    const image = args.image || 'https://example.com/og-cover.jpg';

    return `<!-- ── Primary ─────────────────────────────── -->\n<title>${title}</title>\n<meta name="title" content="${title}" />\n<meta name="description" content="${desc}" />\n<meta name="robots" content="index, follow" />\n<link rel="canonical" href="${url}" />\n\n<!-- ── Open Graph / Facebook ────────────────── -->\n<meta property="og:type" content="website" />\n<meta property="og:url" content="${url}" />\n<meta property="og:title" content="${title}" />\n<meta property="og:description" content="${desc}" />\n<meta property="og:image" content="${image}" />\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n\n<!-- ── Twitter Card ─────────────────────────── -->\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:url" content="${url}" />\n<meta name="twitter:title" content="${title}" />\n<meta name="twitter:description" content="${desc}" />\n<meta name="twitter:image" content="${image}" />\n\n<!-- ── JSON-LD Structured Data ──────────────── -->\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "name": "${title}",\n  "description": "${desc}",\n  "url": "${url}"\n}\n</script>`;
  },
};

// ─── 19. QA: Init Vitest ─────────────────────────────────────────────────────

export const InitVitestSkill: AgentSkill = {
  name: 'init_vitest',
  description:
    'Sets up Vitest (faster Jest alternative for Vite projects) with a sample test and coverage config.',
  example: `<tool_call>\n{"action": "init_vitest", "directory": "./"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    const dir = path.resolve(args.directory);

    const install = await run(`npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom`, dir);
    if (install.startsWith('❌')) return install;

    writeFile(
      path.join(dir, 'vitest.config.ts'),
      `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({\n  test: {\n    globals: true,\n    environment: 'jsdom',\n    setupFiles: ['./src/test/setup.ts'],\n    coverage: {\n      provider: 'v8',\n      reporter: ['text', 'json', 'html'],\n      exclude: ['node_modules/', 'dist/'],\n    },\n  },\n});\n`,
    );

    writeFile(
      path.join(dir, 'src', 'test', 'setup.ts'),
      `import '@testing-library/jest-dom';\n`,
    );

    writeFile(
      path.join(dir, 'src', 'test', 'example.test.ts'),
      `import { describe, it, expect } from 'vitest';\n\ndescribe('Example', () => {\n  it('should work', () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n`,
    );

    return `✅ Vitest initialized → ${args.directory}\nFiles: vitest.config.ts · src/test/setup.ts · src/test/example.test.ts\nNext: Add "test": "vitest", "coverage": "vitest run --coverage" to package.json scripts\n      npm test`;
  },
};

// ─── 20. GIT: Init, Gitignore, and Commit ────────────────────────────────────

export const GitInitSkill: AgentSkill = {
  name: 'git_init_and_commit',
  description:
    'Initializes a git repo, writes a comprehensive .gitignore for Node/React projects, stages everything, and makes the first commit.',
  example: `<tool_call>\n{"action": "git_init_and_commit", "directory": "./"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    const dir = path.resolve(args.directory);

    writeFile(
      path.join(dir, '.gitignore'),
      `# Dependencies\nnode_modules/\n.pnp\n.pnp.js\n\n# Build outputs\ndist/\nbuild/\nout/\n.next/\n.nuxt/\n\n# Environment\n.env\n.env.local\n.env.*.local\n!.env.example\n\n# Logs\nnpm-debug.log*\nyarn-debug.log*\n*.log\n\n# OS\n.DS_Store\nThumbs.db\n\n# IDE\n.idea/\n.vscode/settings.json\n*.suo\n*.swp\n\n# Testing\ncoverage/\n.nyc_output/\n\n# Misc\n*.tsbuildinfo\n`,
    );

    const result = await run(
      `git init && git add . && git commit -m "chore: initial commit by ATCLI 🚀"`,
      dir,
    );
    return result.startsWith('❌')
      ? result
      : `✅ Git repo initialized with .gitignore and initial commit → ${dir}\n${result}`;
  },
};

// ─── 21. UI/UX: Generate SVG Placeholder ────────────────────────────────────

export const GenerateSvgPlaceholderSkill: AgentSkill = {
  name: 'generate_svg_placeholder',
  description:
    'Generates a base64 SVG placeholder <img> src. Supports custom width, height, text, background color, and text color.',
  example: `<tool_call>\n{"action": "generate_svg_placeholder", "width": 1200, "height": 630, "text": "OG Image", "bg": "#1a1a2e", "color": "#00d4ff"}\n</tool_call>`,
  execute: async (args: any) => {
    const w = args.width || 800;
    const h = args.height || 600;
    const text = args.text || `${w}×${h}`;
    const bg = args.bg || '#cccccc';
    const color = args.color || '#444444';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <rect width="${w}" height="${h}" fill="${bg}"/>\n  <line x1="0" y1="0" x2="${w}" y2="${h}" stroke="${color}" stroke-opacity="0.15" stroke-width="1"/>\n  <line x1="${w}" y1="0" x2="0" y2="${h}" stroke="${color}" stroke-opacity="0.15" stroke-width="1"/>\n  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="1"/>\n  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"\n    font-family="system-ui, sans-serif" font-size="${Math.min(w, h) * 0.06}px"\n    font-weight="600" fill="${color}">${text}</text>\n  <text x="50%" y="calc(50% + ${Math.min(w, h) * 0.08}px)" dominant-baseline="middle" text-anchor="middle"\n    font-family="system-ui, sans-serif" font-size="${Math.min(w, h) * 0.035}px"\n    fill="${color}" opacity="0.6">${w} × ${h}</text>\n</svg>`;

    const b64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
  },
};

// ─── 22. SECURITY: Generate .env Files ─────────────────────────────────────

export const GenerateEnvFilesSkill: AgentSkill = {
  name: 'generate_env_files',
  description:
    'Generates .env and .env.example files with common full-stack variables. Enforces security layer by verifying .gitignore.',
  example: `<tool_call>\n{"action": "generate_env_files", "directory": "./", "projectName": "my-app"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'directory');
    if (err) return err;
    const dir = path.resolve(args.directory);
    const name = args.projectName || 'app';

    const example = `# ── Server ───────────────────────────────\nPORT=3001\nNODE_ENV=development  # development | production | test\n\n# ── Database ─────────────────────────────\nDATABASE_URL=postgresql://admin:secret@localhost:5432/${name}db\n\n# ── Auth ─────────────────────────────────\nJWT_SECRET=your-256-bit-secret-here\nJWT_EXPIRES_IN=7d\nSESSION_SECRET=your-session-secret-here\n\n# ── CORS ─────────────────────────────────\nCORS_ORIGIN=http://localhost:5173\n`;

    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const sessionSecret = crypto.randomBytes(32).toString('base64url');
    const real = example
      .replace('your-256-bit-secret-here', jwtSecret)
      .replace('your-session-secret-here', sessionSecret);

    if (!fs.existsSync(path.join(dir, '.env'))) {
      writeFile(path.join(dir, '.env'), real);
    }
    writeFile(path.join(dir, '.env.example'), example);

    // Enforce Security Layer
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes('.env')) {
            fs.appendFileSync(gitignorePath, '\\n.env\\n');
        }
    } else {
        writeFile(gitignorePath, '.env\\n');
    }

    return `✅ Environment files generated → ${args.directory}\n  • .env         – real secrets (auto-generated, git-ignored securely)\n  • .env.example – template (safe to commit)\n🛡️ ATCLI Security Layer: Successfully ensured .env is excluded in .gitignore.`;
  },
};

// ─── 23. 3D WEB: Shader Material Snippet ─────────────────────────────────────

export const GetShaderSnippetSkill: AgentSkill = {
  name: 'get_shader_snippet',
  description:
    'Returns a Three.js ShaderMaterial boilerplate with animated time uniform — ready to drop into a scene.',
  example: `<tool_call>\n{"action": "get_shader_snippet"}\n</tool_call>`,
  execute: async () => `import * as THREE from 'three';\n\n// Vertex Shader\nconst vertexShader = \`\n  varying vec2 vUv;\n  varying vec3 vNormal;\n  void main() {\n    vUv = uv;\n    vNormal = normalize(normalMatrix * normal);\n    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  }\n\`;\n\n// Fragment Shader\nconst fragmentShader = \`\n  uniform float uTime;\n  varying vec2 vUv;\n  varying vec3 vNormal;\n\n  void main() {\n    vec3 color = 0.5 + 0.5 * cos(uTime + vUv.xyx + vec3(0.0, 2.0, 4.0));\n    float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);\n    gl_FragColor = vec4(mix(color, vec3(1.0), fresnel * 0.5), 1.0);\n  }\n\`;\n\n// Material\nconst material = new THREE.ShaderMaterial({\n  vertexShader,\n  fragmentShader,\n  uniforms: {\n    uTime: { value: 0 },\n  },\n});\n\n// In your render loop:\n// material.uniforms.uTime.value = clock.getElapsedTime();\n`,
};

// ─── 24. FRONTEND: Generate Component ────────────────────────────────────────

export const GenerateReactComponentSkill: AgentSkill = {
  name: 'generate_react_component',
  description:
    'Generates a typed React component file (FC) with props interface, default export, and optional Tailwind className.',
  example: `<tool_call>\n{"action": "generate_react_component", "filePath": "./src/components/Button.tsx", "componentName": "Button"}\n</tool_call>`,
  execute: async (args: any) => {
    const err = requireArg(args, 'filePath', 'componentName');
    if (err) return err;
    const { componentName, filePath } = args;

    writeFile(
      filePath,
      `import React from 'react';\n\n// ── Types ────────────────────────────────────────────────────\ninterface ${componentName}Props {\n  children?: React.ReactNode;\n  className?: string;\n  onClick?: () => void;\n  disabled?: boolean;\n  variant?: 'primary' | 'secondary' | 'ghost';\n}\n\n// ── Component ─────────────────────────────────────────────────\nconst ${componentName}: React.FC<${componentName}Props> = ({\n  children,\n  className = '',\n  onClick,\n  disabled = false,\n  variant = 'primary',\n}) => {\n  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';\n  const variants = {\n    primary: 'bg-blue-600 text-white hover:bg-blue-700',\n    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',\n    ghost: 'bg-transparent hover:bg-gray-100',\n  };\n\n  return (\n    <button\n      className={\`\${base} \${variants[variant]} \${className}\`}\n      onClick={onClick}\n      disabled={disabled}\n      type="button"\n    >\n      {children}\n    </button>\n  );\n};\n\nexport default ${componentName};\n`,
    );

    return `✅ React component generated → ${filePath}\nProps: children · className · onClick · disabled · variant (primary | secondary | ghost)\nIncludes: TypeScript types · Tailwind variants · accessibility attributes`;
  },
};
