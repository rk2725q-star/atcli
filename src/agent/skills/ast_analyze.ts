import { AgentSkill } from './base';
import * as path from 'path';
import * as fs from 'fs';

export const AstAnalyzeSkill: AgentSkill = {
    name: 'analyze_file_ast',
    description: `[BETA] Deep File Architecture Analyzer.
Instead of reading 2,000 lines of raw code, this tool uses the TypeScript compiler API to extract only the architecture of a file (Exports, Classes, Interfaces, Functions).
Use this to understand what a massive file does without bloating your context window.

Arguments:
  file (required) — Absolute or relative path to the .ts or .js file.
`,
    example: `<tool_call>\n{"action": "analyze_file_ast", "file": "src/agent/loop.ts"}\n</tool_call>`,
    execute: async (args: any) => {
        if (!args.file) return 'Error: file is required.';
        const cwd = (global as any).atcli_project_root || process.cwd();
        const fullPath = path.resolve(cwd, args.file);
        
        if (!fs.existsSync(fullPath)) return `Error: File not found at ${fullPath}`;

        try {
            // Dynamically import typescript to avoid bloat if not used
            const ts = require('typescript');
            
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const sourceFile = ts.createSourceFile(
                args.file,
                fileContent,
                ts.ScriptTarget.Latest,
                true
            );

            const analysis: any = {
                file: args.file,
                classes: [],
                interfaces: [],
                functions: [],
                exports: []
            };

            function visit(node: any) {
                // Check if it's exported
                const isExported = node.modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword);
                
                if (ts.isClassDeclaration(node) && node.name) {
                    const methods = node.members
                        .filter(ts.isMethodDeclaration)
                        .map((m: any) => m.name?.getText(sourceFile))
                        .filter(Boolean);
                    analysis.classes.push({ name: node.name.text, methods, isExported });
                    if (isExported) analysis.exports.push(node.name.text);
                } else if (ts.isInterfaceDeclaration(node)) {
                    analysis.interfaces.push({ name: node.name.text, isExported });
                    if (isExported) analysis.exports.push(node.name.text);
                } else if (ts.isFunctionDeclaration(node) && node.name) {
                    analysis.functions.push({ name: node.name.text, isExported });
                    if (isExported) analysis.exports.push(node.name.text);
                } else if (ts.isVariableStatement(node) && isExported) {
                    node.declarationList.declarations.forEach((d: any) => {
                        if (ts.isIdentifier(d.name)) {
                            analysis.exports.push(d.name.text);
                        }
                    });
                }
                
                ts.forEachChild(node, visit);
            }

            visit(sourceFile);

            return `[AST Architecture Summary for ${args.file}]\n\n` + JSON.stringify(analysis, null, 2) + `\n\n[Use 'read_file' if you need to see the actual implementation logic.]`;
        } catch (e: any) {
            return `Error parsing AST: ${e.message}. (Ensure the file is valid TS/JS and the 'typescript' package is available).`;
        }
    }
};
