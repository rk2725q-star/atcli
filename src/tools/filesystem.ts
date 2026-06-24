import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemTools {
    public static async readFile(filePath: string): Promise<string> {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);
            const content = await fs.readFile(absolutePath, 'utf-8');
            return content;
        } catch (error: any) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    public static async writeFile(filePath: string, content: string): Promise<void> {
        try {
            const absolutePath = path.resolve(process.cwd(), filePath);
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            await fs.writeFile(absolutePath, content, 'utf-8');
        } catch (error: any) {
            throw new Error(`Failed to write file: ${error.message}`);
        }
    }
}
