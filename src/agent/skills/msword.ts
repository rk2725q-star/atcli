import { AgentSkill } from './base';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// MARK-BASED CONTENT GUIDE
// Maps exam marks to recommended word count, paragraph count, and depth level.
// Used by AI to know how much to write per question.
// ─────────────────────────────────────────────────────────────────────────────
export const MARK_GUIDE: Record<number, { minWords: number; maxWords: number; paragraphs: number; depth: string; structure: string }> = {
    2:  { minWords: 60,   maxWords: 120,  paragraphs: 1,  depth: 'definition only',                            structure: 'Definition + 1 key point' },
    3:  { minWords: 120,  maxWords: 180,  paragraphs: 2,  depth: 'brief explanation',                          structure: 'Definition + explanation + 1 example' },
    4:  { minWords: 180,  maxWords: 250,  paragraphs: 2,  depth: 'short explanation',                          structure: 'Definition + 2-3 key points + short example' },
    5:  { minWords: 280,  maxWords: 380,  paragraphs: 3,  depth: 'medium explanation',                         structure: 'Intro + 3-4 points + example + conclusion' },
    6:  { minWords: 380,  maxWords: 480,  paragraphs: 4,  depth: 'medium with advantages',                     structure: 'Intro + 4 points + advantages + example' },
    8:  { minWords: 550,  maxWords: 700,  paragraphs: 5,  depth: 'detailed with diagram note',                 structure: 'Intro + 5 points + table/diagram + advantages + conclusion' },
    10: { minWords: 750,  maxWords: 950,  paragraphs: 6,  depth: 'full-page detailed answer',                  structure: 'Intro + definition + detailed explanation + subtypes + diagram + example + conclusion' },
    12: { minWords: 950,  maxWords: 1200, paragraphs: 7,  depth: 'comprehensive answer',                       structure: 'Intro + definition + types + working + advantages + disadvantages + applications + conclusion' },
    16: { minWords: 1300, maxWords: 1700, paragraphs: 12, depth: 'academic essay — 8-10 subheadings',         structure: 'Introduction → Subheading 1: Definition → Subheading 2: Types/Classification → Subheading 3: Working/Mechanism → Subheading 4: Architecture/Block diagram description → Subheading 5: Advantages → Subheading 6: Disadvantages → Subheading 7: Applications → Subheading 8: Comparison with alternatives → [Subheading 9-10 for deep topics] → Conclusion → References' },
    20: { minWords: 1800, maxWords: 2500, paragraphs: 15, depth: 'exhaustive essay — 10+ subheadings + case study', structure: 'Introduction → Definition → Types → Detailed Working → Architecture → Diagram description → Advantages → Disadvantages → Real-world Applications → Case Study → Comparison table → Future Scope → Conclusion → References' },
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT STYLE PRESETS
// ─────────────────────────────────────────────────────────────────────────────
const STYLE_PRESETS = {
    school:  { font: 'Times New Roman', size: 24, headingSize: 28, titleSize: 36, spacing: 360, margin: 1440 },
    college: { font: 'Times New Roman', size: 24, headingSize: 28, titleSize: 40, spacing: 360, margin: 1440 },
    job:     { font: 'Calibri',         size: 22, headingSize: 26, titleSize: 36, spacing: 240, margin: 1080 },
    report:  { font: 'Arial',           size: 22, headingSize: 26, titleSize: 36, spacing: 240, margin: 1080 },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getMarkGuide(marks: number): { minWords: number; maxWords: number; paragraphs: number; depth: string; structure: string } {
    // Find exact or next-lower mark level
    const keys = Object.keys(MARK_GUIDE).map(Number).sort((a, b) => a - b);
    let guide = MARK_GUIDE[2];
    for (const k of keys) {
        if (marks >= k) guide = MARK_GUIDE[k];
    }
    return guide;
}

function buildMarkGuideSummary(): string {
    return Object.entries(MARK_GUIDE)
        .map(([mark, g]) => `  • ${mark} marks: ${g.minWords}–${g.maxWords} words — ${g.depth}\n    Structure: ${g.structure}`)
        .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SKILL
// ─────────────────────────────────────────────────────────────────────────────
export const MSWordSkill: AgentSkill = {
    name: 'create_word_doc',
    description: `Creates a fully formatted Microsoft Word (.docx) document. Supports school/college/job documents with professional formatting (fonts, borders, tables, headers, footers, page numbers). Intelligently handles mark-based questions (2, 3, 4, 5, 8, 10, 12, 16, 20 marks) with appropriate word count and structure. Can generate 1-30+ page documents. The 'get_mark_guide' action returns the word count and structure guide for each mark level.`,
    example: `<tool_call>
{"action": "create_word_doc", "filename": "computer_networks_project.docx", "document_type": "college", "title": "Computer Networks", "subtitle": "Lab Record / Project Report", "institution": "ABC Engineering College", "department": "Computer Science and Engineering", "student_name": "Student Name", "roll_number": "20CS001", "year": "III Year - VI Semester", "subject_code": "CS6551", "style": {"font": "Times New Roman", "font_size": 12, "line_spacing": 1.5, "page_border": true, "header_footer": true}, "sections": [{"title": "What is TCP/IP?", "marks": 10, "content": "TCP/IP (Transmission Control Protocol/Internet Protocol) is the fundamental communication protocol suite of the internet...\\n\\nKey Components:\\n1. TCP (Transmission Control Protocol) ensures reliable, ordered delivery of data packets between applications...\\n2. IP (Internet Protocol) handles addressing and routing of packets across networks...\\n\\nWorking:\\nThe TCP/IP model operates in four layers: Application, Transport, Internet, and Network Access...\\n\\nAdvantages:\\n- Standardized protocol\\n- Supports routing\\n- Scalable for large networks\\n\\nConclusion:\\nTCP/IP is the backbone of modern internet communication, enabling reliable data transfer globally."}]}
</tool_call>`,
    execute: async (args: any) => {
        // ── SPECIAL ACTION: return mark guide info ──────────────────────────
        if (args.action === 'get_mark_guide' || args.get_guide) {
            const specific = args.marks ? getMarkGuide(Number(args.marks)) : null;
            if (specific && args.marks) {
                const g = specific;
                return `📝 Mark Guide for ${args.marks} marks:\n  Word count: ${g.minWords}–${g.maxWords} words\n  Paragraphs: ${g.paragraphs}\n  Depth: ${g.depth}\n  Structure: ${g.structure}`;
            }
            return `📝 ATCLI Mark-Based Writing Guide:\n${buildMarkGuideSummary()}\n\nUsage: When writing answers, match the word count to the mark allocation. More marks = more depth, examples, subtypes, and conclusion.`;
        }

        // ── VALIDATE ─────────────────────────────────────────────────────────
        if (!args.filename) return 'Error: filename is required (e.g. "my_project.docx")';
        if (!args.sections || !Array.isArray(args.sections) || args.sections.length === 0) {
            return 'Error: sections array is required. Each section needs { title, content, marks? }';
        }

        try {
            // Dynamic import of docx (loaded at runtime)
            const {
                Document, Packer, Paragraph, TextRun, HeadingLevel,
                AlignmentType, BorderStyle, TableRow, TableCell,
                Table, WidthType, Header, Footer, PageNumber,
                convertInchesToTwip, LineRuleType,
                UnderlineType,
            } = await import('docx');

            // ── DUAL-FONT STYLE SETUP ─────────────────────────────────────────
            // Heading font (for question titles, subheadings) vs Body font (for answer text)
            const styleOverride = args.style || {};
            const docType = (args.document_type || 'college') as keyof typeof STYLE_PRESETS;

            // Heading font — default: Times New Roman (used for question headings & subheadings)
            const headingFont  = styleOverride.heading_font || styleOverride.font || 'Times New Roman';
            const headingPt    = ((styleOverride.heading_size || 14) * 2);    // half-points (14pt = 28)
            const titlePt      = headingPt + 8;                                // title page font (22pt = 44)

            // Body font — default: Arial (used for answer paragraphs, bullets, references)
            // If user only specifies one font, body = heading font (single-font mode)
            const bodyFont     = styleOverride.body_font
                               || (styleOverride.heading_font && !styleOverride.body_font ? styleOverride.font || 'Arial' : null)
                               || (styleOverride.font ? 'Arial' : 'Arial');
            const bodyFontSize = ((styleOverride.font_size || styleOverride.body_font_size || 12) * 2); // 12pt = 24

            const lineSpacing  = styleOverride.line_spacing || 1.5;
            const spacingVal   = Math.round(lineSpacing * 240);
            const pageBorder   = styleOverride.page_border !== false;
            const hasHeaderFooter = styleOverride.header_footer !== false;

            // ── CONTENT HELPERS ───────────────────────────────────────────────

            // makePara — BODY TEXT: uses bodyFont + bodyFontSize (e.g. Arial 12pt)
            const makePara = (text: string, opts?: {
                bold?: boolean; italic?: boolean; size?: number; font?: string;
                align?: typeof AlignmentType[keyof typeof AlignmentType];
                heading?: typeof HeadingLevel[keyof typeof HeadingLevel];
                underline?: boolean; spaceBefore?: number; spaceAfter?: number;
                keepLines?: boolean;
            }) => {
                const runs: InstanceType<typeof TextRun>[] = text.split('\n').map((line, i) =>
                    new TextRun({
                        text: line,
                        bold: opts?.bold,
                        italics: opts?.italic,
                        size: opts?.size || bodyFontSize,   // ← body size (12pt)
                        font: opts?.font || bodyFont,       // ← body font (Arial)
                        break: i > 0 ? 1 : 0,
                        underline: opts?.underline ? { type: UnderlineType.SINGLE } : undefined,
                    })
                );
                return new Paragraph({
                    children: runs,
                    heading: opts?.heading,
                    alignment: opts?.align || AlignmentType.JUSTIFIED,
                    spacing: {
                        line: spacingVal,
                        lineRule: LineRuleType.AUTO,
                        before: opts?.spaceBefore ?? 0,
                        after:  opts?.spaceAfter  ?? 60,
                    },
                    widowControl: true,
                    keepLines: opts?.keepLines ?? false,
                });
            };

            // makeHeading — QUESTION HEADINGS: headingFont + headingPt (Times New Roman 14pt)
            // keepNext: true ensures heading never appears alone at bottom of page
            const makeHeading = (text: string, level: 1 | 2 | 3) => {
                const sizes: Record<1|2|3, number> = { 1: titlePt, 2: headingPt, 3: headingPt - 2 };
                return new Paragraph({
                    children: [new TextRun({
                        text, bold: true,
                        size: sizes[level],
                        font: headingFont,   // ← heading font (Times New Roman)
                        underline: level === 2 ? { type: UnderlineType.SINGLE } : undefined,
                    })],
                    alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
                    spacing: { before: level === 1 ? 0 : 200, after: 80, line: spacingVal, lineRule: LineRuleType.AUTO },
                    keepNext: true,
                    widowControl: true,
                });
            };

            // makeSubHeading — INLINE SUBHEADINGS: headingFont, slightly smaller (13pt)
            // keepNext: true ensures subheading never appears alone at bottom of page
            const makeSubHeading = (text: string) => new Paragraph({
                children: [new TextRun({
                    text, bold: true,
                    size: headingPt - 2,    // ← heading font size - 1pt (13pt)
                    font: headingFont,      // ← heading font (Times New Roman)
                    underline: { type: UnderlineType.SINGLE },
                })],
                alignment: AlignmentType.LEFT,
                spacing: { before: 120, after: 40, line: spacingVal, lineRule: LineRuleType.AUTO },
                keepNext: true,
                widowControl: true,
            });


            // ── PAGE BORDER CONFIG ────────────────────────────────────────────
            const borderConfig = pageBorder ? {
                top:    { style: BorderStyle.SINGLE, size: 12, color: '000080', space: 24 },
                bottom: { style: BorderStyle.SINGLE, size: 12, color: '000080', space: 24 },
                left:   { style: BorderStyle.SINGLE, size: 12, color: '000080', space: 24 },
                right:  { style: BorderStyle.SINGLE, size: 12, color: '000080', space: 24 },
            } : undefined;

            // ── TITLE PAGE ────────────────────────────────────────────────────
            // Title page uses headingFont for all text (professional look)
            const titlePageChildren: any[] = [
                makePara('', { spaceAfter: 600 }),
                makePara('', { spaceAfter: 400 }),
                ...(args.institution ? [new Paragraph({ children: [new TextRun({ text: args.institution.toUpperCase(), bold: true, size: titlePt + 4, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 160 } })] : []),
                ...(args.department  ? [new Paragraph({ children: [new TextRun({ text: args.department,  bold: false, size: bodyFontSize + 4, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                makePara('', { spaceAfter: 400 }),
                new Paragraph({ children: [new TextRun({ text: '─'.repeat(40), size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER }),
                makePara('', { spaceAfter: 200 }),
                makeHeading(args.title || 'Untitled Document', 1),
                ...(args.subtitle ? [new Paragraph({ children: [new TextRun({ text: args.subtitle, bold: false, size: bodyFontSize + 2, font: headingFont, italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 120 } })] : []),
                ...(args.subject_code ? [new Paragraph({ children: [new TextRun({ text: `Subject Code: ${args.subject_code}`, size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                makePara('', { spaceAfter: 400 }),
                new Paragraph({ children: [new TextRun({ text: '─'.repeat(40), size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER }),
                makePara('', { spaceAfter: 200 }),
                ...(args.student_name  ? [new Paragraph({ children: [new TextRun({ text: `Student Name : ${args.student_name}`, bold: true, size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                ...(args.roll_number   ? [new Paragraph({ children: [new TextRun({ text: `Roll Number  : ${args.roll_number}`, bold: true, size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                ...(args.year          ? [new Paragraph({ children: [new TextRun({ text: args.year, size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                ...(args.year_academic ? [new Paragraph({ children: [new TextRun({ text: `Academic Year: ${args.year_academic}`, size: bodyFontSize, font: headingFont })], alignment: AlignmentType.CENTER, spacing: { after: 80 } })] : []),
                makePara('', { spaceAfter: 400 }),

            ];


            // ── SECTIONS ──────────────────────────────────────────────────────
            const sectionChildren: any[] = [];
            let qNum = 1;
            for (const section of args.sections) {
                const marks = section.marks ? Number(section.marks) : 0;
                const guide = marks > 0 ? getMarkGuide(marks) : null;
                const markLabel = marks > 0 ? ` [${marks} Marks]` : '';

                sectionChildren.push(makeHeading(`${qNum}. ${section.title || section.question || 'Section'}${markLabel}`, 2));

                // NOTE: Do NOT add the '(Expected: N words)' line to the document body
                // That is only for internal AI guidance, not for the student's document

                const contentText: string = section.content || section.answer || section.text || '';
                const lines = contentText.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        sectionChildren.push(makePara('', { spaceAfter: 60 }));
                        continue;
                    }

                    // ── Markdown heading: ### text → Heading 3 (sub-subheading)
                    if (trimmed.startsWith('### ')) {
                        const hText = trimmed.replace(/^###\s*/, '').replace(/\*\*/g, '');
                        sectionChildren.push(makeSubHeading(hText + ':'));
                        continue;
                    }
                    // ── Markdown heading: ## text → Heading 2 (major subheading)
                    if (trimmed.startsWith('## ')) {
                        const hText = trimmed.replace(/^##\s*/, '').replace(/\*\*/g, '');
                        sectionChildren.push(makeHeading(hText, 2));
                        continue;
                    }
                    // ── Markdown heading: # text → Heading 1 (section title)
                    if (trimmed.startsWith('# ') && !trimmed.startsWith('# ─')) {
                        const hText = trimmed.replace(/^#\s*/, '').replace(/\*\*/g, '');
                        sectionChildren.push(makeHeading(hText, 2));
                        continue;
                    }

                    // ── Inline subheadings: short line ending with :
                    // Must be < 55 chars, not starting with bullet/number, not a sentence
                    if (
                        trimmed.endsWith(':') &&
                        trimmed.length < 55 &&
                        !trimmed.startsWith('-') &&
                        !trimmed.startsWith('•') &&
                        !trimmed.match(/^\d+\./) &&
                        !trimmed.includes('  ')  // real sentences have multiple words with spaces
                    ) {
                        const hText = trimmed.replace(/\*\*/g, '');
                        sectionChildren.push(makeSubHeading(hText));
                        continue;
                    }

                    // ── Numbered list item (1. 2. 3.)
                    if (trimmed.match(/^\d+\.\s/)) {
                        const itemText = trimmed.replace(/\*\*/g, '');
                        sectionChildren.push(new Paragraph({
                            children: [new TextRun({ text: itemText, size: bodyFontSize, font: bodyFont })],
                            indent: { left: convertInchesToTwip(0.3) },
                            spacing: { line: spacingVal, lineRule: LineRuleType.AUTO, after: 60 },
                            alignment: AlignmentType.JUSTIFIED,
                            widowControl: true,
                        }));
                        continue;
                    }

                    // ── Bullet points (- or •) — BODY FONT (Arial 12pt)
                    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
                        const bulletText = trimmed.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '');
                        sectionChildren.push(new Paragraph({
                            children: [new TextRun({ text: '• ' + bulletText, size: bodyFontSize, font: bodyFont })],
                            indent: { left: convertInchesToTwip(0.3) },
                            spacing: { line: spacingVal, lineRule: LineRuleType.AUTO, after: 60 },
                            alignment: AlignmentType.JUSTIFIED,
                            widowControl: true,
                        }));
                        continue;
                    }

                    // ── References [1] ... → italic BODY FONT
                    if (trimmed.match(/^\[\d+\]/) || (trimmed.toLowerCase() === 'references:')) {
                        sectionChildren.push(new Paragraph({
                            children: [new TextRun({ text: trimmed, size: bodyFontSize, font: bodyFont, italics: true })],
                            spacing: { line: spacingVal, lineRule: LineRuleType.AUTO, after: 40 },
                        }));
                        continue;
                    }

                    // ── Regular paragraph (strip any stray **bold** markers)
                    const paraText = trimmed.replace(/\*\*/g, '');
                    sectionChildren.push(makePara(paraText, { spaceBefore: 0, spaceAfter: 60 }));
                }

                // Section separator — just a small gap, no extra blank pages
                sectionChildren.push(makePara('', { spaceAfter: 120 }));
                if (section.table && Array.isArray(section.table)) {
                    const tblRows = section.table.map((row: string[]) =>
                        new TableRow({
                            children: row.map((cell: string, ci: number) =>
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({
                                        text: cell,
                                        bold: section.table.indexOf(row) === 0,
                                        size: bodyFontSize,
                                        font: bodyFont,
                                    })] })],
                                    width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
                                })
                            ),
                        })
                    );
                    sectionChildren.push(new Paragraph({ children: [] }));
                    sectionChildren.push(new Paragraph({ children: [new TextRun({ text: section.table_title || 'Table:', bold: true, size: bodyFontSize, font: headingFont })] }));
                    // @ts-ignore — Table is valid child
                    sectionChildren.push(new Table({ rows: tblRows, width: { size: 9000, type: WidthType.DXA } }));
                    sectionChildren.push(new Paragraph({ children: [] }));
                }

                // Section end gap
                qNum++;
            }

            // ── ASSEMBLE DOCUMENT ─────────────────────────────────────────────
            const docSections: any[] = [
                // Title Page section
                {
                    properties: {
                        page: {
                            borders: borderConfig ? { pageBorderTop: borderConfig.top, pageBorderBottom: borderConfig.bottom, pageBorderLeft: borderConfig.left, pageBorderRight: borderConfig.right } : undefined,
                        },
                    },
                    children: titlePageChildren,
                },
                // Content section
                {
                    properties: {
                        page: {
                            borders: borderConfig ? { pageBorderTop: borderConfig.top, pageBorderBottom: borderConfig.bottom, pageBorderLeft: borderConfig.left, pageBorderRight: borderConfig.right } : undefined,
                        },
                    },
                    headers: hasHeaderFooter ? {
                        default: new Header({
                            children: [new Paragraph({
                                // Header uses headingFont (Times New Roman) — document title
                                children: [new TextRun({ text: args.title || 'Document', size: bodyFontSize - 2, font: headingFont, italics: true })],
                                alignment: AlignmentType.RIGHT,
                            })],
                        }),
                    } : undefined,
                    footers: hasHeaderFooter ? {
                        default: new Footer({
                            children: [new Paragraph({
                                children: [
                                    // Only student name — NO page numbers as per student requirement 2026
                                    new TextRun({
                                        text: [
                                            args.student_name  || '',
                                            args.roll_number   || '',
                                            args.year          || '',
                                        ].filter(Boolean).join('  |  '),
                                        size: bodyFontSize - 4,
                                        font: bodyFont,
                                        italics: true,
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            })],
                        }),
                    } : undefined,
                    children: sectionChildren,
                },
            ];

            const doc = new Document({ sections: docSections });

            // ── SAVE ──────────────────────────────────────────────────────────
            const safeRoot  = (global as any).atcli_project_root || process.cwd();
            const outputDir = args.output_dir ? path.resolve(safeRoot, args.output_dir) : safeRoot;
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            const fileName  = args.filename.endsWith('.docx') ? args.filename : args.filename + '.docx';
            const filePath  = path.join(outputDir, fileName);

            const buffer = await Packer.toBuffer(doc);
            fs.writeFileSync(filePath, buffer);

            // ── SUMMARY ───────────────────────────────────────────────────────
            const totalWords = args.sections.reduce((sum: number, s: any) => {
                return sum + ((s.content || s.answer || s.text || '').split(/\s+/).length);
            }, 0);

            return [
                `✅ Word document created successfully!`,
                `📄 File: ${filePath}`,
                `📊 Stats:`,
                `   • Sections: ${args.sections.length}`,
                `   • Approx. words: ~${totalWords}`,
                `   • Heading font: ${headingFont} ${(headingPt / 2)}pt (questions & subheadings)`,
                `   • Body font   : ${bodyFont} ${(bodyFontSize / 2)}pt (answer text, bullets)`,
                `   • Style: ${docType}`,
                `   • Page border: ${pageBorder ? 'Yes' : 'No'}`,
                `   • Header/Footer: ${hasHeaderFooter ? 'Yes (no page numbers)' : 'No'}`,
                ``,
                `💡 Open with: Microsoft Word, LibreOffice, or Google Docs (upload)`,
            ].join('\n');

        } catch (err: any) {
            if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('docx')) {
                return `Error: 'docx' package not installed. Run: npm install docx\nThen retry.`;
            }
            return `Error creating Word document: ${err.message}\n${err.stack?.substring(0, 500) || ''}`;
        }
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MARK GUIDE SKILL (standalone helper)
// ─────────────────────────────────────────────────────────────────────────────
export const GetMarkGuideSkill: AgentSkill = {
    name: 'get_mark_guide',
    description: 'Returns the recommended word count, paragraph count, and structure for any mark allocation (2, 3, 4, 5, 6, 8, 10, 12, 16, 20 marks). Use this BEFORE writing content for a Word document to know how much to write.',
    example: `<tool_call>\n{"action": "get_mark_guide", "marks": 10}\n</tool_call>`,
    execute: async (args: any) => {
        if (args.marks) {
            const g = getMarkGuide(Number(args.marks));
            return [
                `📝 Writing Guide for ${args.marks} Marks:`,
                `   Word Count : ${g.minWords} – ${g.maxWords} words`,
                `   Paragraphs : ${g.paragraphs}`,
                `   Depth      : ${g.depth}`,
                `   Structure  : ${g.structure}`,
                ``,
                `Example structure for ${args.marks}-mark answer:`,
                g.structure,
            ].join('\n');
        }
        // Return full guide
        return `📝 ATCLI Mark-Based Writing Guide:\n\n${buildMarkGuideSummary()}\n\nTip: Always match your word count to the mark. More marks = more depth, examples, and conclusion.`;
    },
};
