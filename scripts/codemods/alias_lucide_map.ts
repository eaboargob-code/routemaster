#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

interface TransformResult {
  modified: boolean;
  content: string;
  importsRewritten: number;
  jsxTagsRewritten: number;
}

interface Summary {
  filesScanned: number;
  filesModified: number;
  importsRewritten: number;
  jsxTagsRewritten: number;
}

class LucideMapAliaser {
  private summary: Summary = {
    filesScanned: 0,
    filesModified: 0,
    importsRewritten: 0,
    jsxTagsRewritten: 0
  };
  
  private patches: string[] = [];
  private logs: string[] = [];
  private readonly dryRun: boolean;
  
  private readonly targetDirs = ['src', 'apps', 'packages'];
  private readonly excludeDirs = ['node_modules', '.next', 'dist', 'build'];
  private readonly fileExtensions = ['.tsx', '.ts', '.jsx', '.js'];

  constructor(dryRun: boolean = true) {
    this.dryRun = dryRun;
  }

  async run(): Promise<void> {
    const mode = this.dryRun ? 'DRY-RUN mode' : 'WRITE mode';
    this.log(`Starting lucide-react Map aliasing codemod (${mode})`);
    this.log(`Target directories: ${this.targetDirs.join(', ')}`);
    this.log(`Excluded directories: ${this.excludeDirs.join(', ')}`);
    this.log(`File extensions: ${this.fileExtensions.join(', ')}`);
    this.log('');

    const rootDir = process.cwd();
    
    for (const targetDir of this.targetDirs) {
      const dirPath = path.join(rootDir, targetDir);
      if (fs.existsSync(dirPath)) {
        await this.processDirectory(dirPath);
      } else {
        this.log(`Directory ${targetDir} not found, skipping...`);
      }
    }

    await this.generateReports();
    this.printSummary();
  }

  private async processDirectory(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        // Skip excluded directories
        if (this.excludeDirs.includes(entry)) {
          continue;
        }
        await this.processDirectory(fullPath);
      } else if (stats.isFile()) {
        const ext = path.extname(entry);
        if (this.fileExtensions.includes(ext)) {
          await this.processFile(fullPath);
        }
      }
    }
  }

  private async processFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      this.summary.filesScanned++;
      
      const result = this.transformContent(content, filePath);
      
      if (result.modified) {
        this.summary.filesModified++;
        this.summary.importsRewritten += result.importsRewritten;
        this.summary.jsxTagsRewritten += result.jsxTagsRewritten;
        
        const relativePath = path.relative(process.cwd(), filePath);
        
        if (this.dryRun) {
          this.log(`Would modify: ${relativePath}`);
          this.log(`  - Imports rewritten: ${result.importsRewritten}`);
          this.log(`  - JSX tags rewritten: ${result.jsxTagsRewritten}`);
          
          // Generate diff for dry-run
          const diff = this.generateDiff(relativePath, content, result.content);
          this.patches.push(diff);
        } else {
          // Actually write the file
          await writeFile(filePath, result.content, 'utf-8');
          this.log(`Modified: ${relativePath}`);
          this.log(`  - Imports rewritten: ${result.importsRewritten}`);
          this.log(`  - JSX tags rewritten: ${result.jsxTagsRewritten}`);
        }
      }
    } catch (error) {
      this.log(`Error processing ${filePath}: ${error}`);
    }
  }

  private transformContent(content: string, filePath: string): TransformResult {
    let modified = false;
    let importsRewritten = 0;
    let jsxTagsRewritten = 0;
    let result = content;

    // Check if file imports from lucide-react
    const lucideImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"];?/g;
    const matches = Array.from(content.matchAll(lucideImportRegex));
    
    if (matches.length === 0) {
      return { modified, content: result, importsRewritten, jsxTagsRewritten };
    }

    // Process each lucide-react import
    for (const match of matches) {
      const fullImport = match[0];
      const importList = match[1];
      
      // Check if Map is imported and not already aliased
      const mapImportRegex = /\bMap\b(?!\s+as\s+\w+)/;
      if (mapImportRegex.test(importList)) {
        // Check if already aliased as MapIcon
        if (importList.includes('Map as MapIcon')) {
          continue; // Already aliased, skip
        }
        
        // Rewrite the import
        const newImportList = importList.replace(/\bMap\b/, 'Map as MapIcon');
        const newImport = fullImport.replace(importList, newImportList);
        result = result.replace(fullImport, newImport);
        modified = true;
        importsRewritten++;
        
        // Now replace JSX usages
        const jsxResult = this.replaceJSXUsages(result);
        result = jsxResult.content;
        jsxTagsRewritten += jsxResult.tagsRewritten;
        if (jsxResult.tagsRewritten > 0) {
          modified = true;
        }
      }
    }

    return { modified, content: result, importsRewritten, jsxTagsRewritten };
  }

  private replaceJSXUsages(content: string): { content: string; tagsRewritten: number } {
    let result = content;
    let tagsRewritten = 0;

    // Replace opening tags: <Map ...> -> <MapIcon ...>
    // Use negative lookbehind to avoid matching things like <SomeMap>
    const openingTagRegex = /(?<![\w])(<Map)(\s|>|\/)/g;
    const openingMatches = Array.from(result.matchAll(openingTagRegex));
    for (const match of openingMatches) {
      result = result.replace(match[0], `<MapIcon${match[2]}`);
      tagsRewritten++;
    }

    // Replace closing tags: </Map> -> </MapIcon>
    const closingTagRegex = /(?<![\w])(<\/Map>)/g;
    const closingMatches = Array.from(result.matchAll(closingTagRegex));
    for (const match of closingMatches) {
      result = result.replace(match[0], '</MapIcon>');
      tagsRewritten++;
    }

    return { content: result, tagsRewritten };
  }

  private generateDiff(filePath: string, original: string, modified: string): string {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;
    
    // Simple line-by-line diff
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    let hunkStart = -1;
    let hunkLines: string[] = [];
    
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i] || '';
      const modLine = modifiedLines[i] || '';
      
      if (origLine !== modLine) {
        if (hunkStart === -1) {
          hunkStart = i;
        }
        
        if (origLine) {
          hunkLines.push(`-${origLine}`);
        }
        if (modLine) {
          hunkLines.push(`+${modLine}`);
        }
      } else if (hunkStart !== -1) {
        // End of hunk
        const contextBefore = Math.max(0, hunkStart - 3);
        const contextAfter = Math.min(originalLines.length - 1, i + 3);
        
        diff += `@@ -${contextBefore + 1},${contextAfter - contextBefore + 1} +${contextBefore + 1},${contextAfter - contextBefore + 1} @@\n`;
        
        // Add context before
        for (let j = contextBefore; j < hunkStart; j++) {
          diff += ` ${originalLines[j]}\n`;
        }
        
        // Add changes
        for (const line of hunkLines) {
          diff += `${line}\n`;
        }
        
        // Add context after
        for (let j = i; j <= contextAfter && j < originalLines.length; j++) {
          diff += ` ${originalLines[j]}\n`;
        }
        
        hunkStart = -1;
        hunkLines = [];
      }
    }
    
    // Handle case where diff goes to end of file
    if (hunkStart !== -1) {
      const contextBefore = Math.max(0, hunkStart - 3);
      diff += `@@ -${contextBefore + 1},${originalLines.length - contextBefore} +${contextBefore + 1},${modifiedLines.length - contextBefore} @@\n`;
      
      for (let j = contextBefore; j < hunkStart; j++) {
        diff += ` ${originalLines[j]}\n`;
      }
      
      for (const line of hunkLines) {
        diff += `${line}\n`;
      }
    }
    
    return diff + '\n';
  }

  private async generateReports(): Promise<void> {
    // Ensure docs directory exists
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    if (this.dryRun) {
      // Save patches to diff file only in dry-run mode
      const patchContent = this.patches.join('\n');
      const patchPath = path.join(docsDir, 'patch_alias_lucide_map.diff');
      await writeFile(patchPath, patchContent);
      this.log(`Patches saved to: ${patchPath}`);
    }
    
    // Save logs
    const logContent = this.logs.join('\n');
    const logPath = path.join(docsDir, 'alias_lucide_map.log');
    await writeFile(logPath, logContent);
    this.log(`Logs saved to: ${logPath}`);
  }

  private printSummary(): void {
    const mode = this.dryRun ? 'DRY-RUN' : 'WRITE';
    console.log(`\n=== CODEMOD SUMMARY (${mode}) ===`);
    console.log(`Files scanned: ${this.summary.filesScanned}`);
    console.log(`Files modified: ${this.summary.filesModified}`);
    console.log(`Imports rewritten: ${this.summary.importsRewritten}`);
    console.log(`JSX tags rewritten: ${this.summary.jsxTagsRewritten}`);
    
    if (this.dryRun) {
      console.log('\nNo files were actually modified (dry-run mode).');
      console.log('Check docs/patch_alias_lucide_map.diff for proposed changes.');
    } else {
      console.log(`\n${this.summary.filesModified} files were successfully modified.`);
    }
    console.log('Check docs/alias_lucide_map.log for detailed logs.');
  }

  private log(message: string): void {
    this.logs.push(`[${new Date().toISOString()}] ${message}`);
    console.log(message);
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write') || args.includes('-w');
  const dryRun = !writeMode;
  
  const aliaser = new LucideMapAliaser(dryRun);
  await aliaser.run();
}

if (require.main === module) {
  main().catch(console.error);
}

export default LucideMapAliaser;