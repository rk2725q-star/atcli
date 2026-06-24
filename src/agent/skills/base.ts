export interface AgentSkill {
    name: string;
    description: string;
    example: string;
    execute: (args: any) => Promise<string>;
}
