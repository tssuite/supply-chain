// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assert } from './internal/assert.ts';

import type { GraphScopeItem } from './graph.ts';
import type { Node } from './node.ts';

/* v8 ignore file */

/// The markdown export format
export enum MarkdownFormat {
  /// Wraps mermaid code into ```
  gitHub = 'gitHub',

  /// Wraps mermaid code into :::
  azure = 'azure',
}

/**
 * Converts a graph to the Mermaid format.
 */
export class GraphToMermaid {
  /**
   * Constructor
   * @param p - The constructor parameters
   */
  constructor(p: { graph: GraphScopeItem; indent?: number }) {
    this.graph = p.graph;
    this.indent = p.indent ?? 2;
    this._baseIndent = ' '.repeat(this.indent);
  }

  /**
   * The graph to be converted
   */
  readonly graph: GraphScopeItem;

  /**
   * The indentation
   */
  readonly indent: number;

  /**
   * Turn a graph into Mermaid format
   */
  get mermaid(): string {
    const header = 'flowchart TD\n';
    const nodes = this._mermaidNodes(this.graph, this.indent);
    const edges = this._mermaidEdges(this.graph);
    const style = this._style;
    return `${header}${nodes}\n${edges}\n${style}`;
  }

  /**
   * Turn a graph into mermaid markdown
   * @param p - The parameters
   */
  markdown(p: { markdownFormat?: MarkdownFormat } = {}): string {
    const markdownFormat = p.markdownFormat ?? MarkdownFormat.gitHub;
    let d: string;
    switch (markdownFormat) {
      case MarkdownFormat.azure:
        d = ':::';
        break;
      case MarkdownFormat.gitHub:
        d = '```';
        break;
    }

    // :::mermaid ...code ... :::
    const result = [`${d}mermaid`, this.mermaid, d].join('\n');
    return result;
  }

  /**
   * Save the graph as an image file
   *
   * The format can be dot, mmd, md, svg, png, pdf
   * @param p - The parameters
   */
  async writeImageFile(p: {
    path: string;
    scale?: number;
    write2x?: boolean;
    markdownFormat?: MarkdownFormat;
  }): Promise<void> {
    /* v8 ignore start -- node-only fs/subprocess IO exercised only with external mermaid tooling */
    const path = p.path;
    const scale = p.scale ?? 1.0;
    const write2x = p.write2x ?? false;
    const markdownFormat = p.markdownFormat ?? MarkdownFormat.gitHub;

    // Get the format
    const format = path.split('.')[path.split('.').length - 1];
    const mm = this.mermaid;

    // Node-only modules are imported lazily so that the pure string
    // generation above does not depend on any node builtins.
    const fs = await import('node:fs/promises');

    // Write mmd files directly
    if (format === 'mmd') {
      await fs.writeFile(path, mm);
      return;
    }
    // Write markdown file
    else if (format === 'md') {
      const result = this.markdown({ markdownFormat });
      await fs.writeFile(path, result);
    } else {
      const env = (await import('node:process')).env;
      const { spawnSync } = await import('node:child_process');
      const os = await import('node:os');
      const nodePath = await import('node:path');

      if (!('GITHUB_ACTIONS' in env) && !('TF_BUILD' in env)) {
        // Check if mmdc is installed
        let error = 0;
        try {
          const mmdcProcess = spawnSync('mmdc', ['--version']);
          error = mmdcProcess.status ?? 1;
        } catch {
          error = 1;
        }

        if (error !== 0) {
          throw new Error(
            [
              'Mermaid CLI (mmdc) is not installed. ',
              'Please install it via npm:',
              'npm install -g @mermaid-js/mermaid-cli',
            ].join('\n'),
          );
        }

        // Write mermaid file to tmp
        const fileName = path.split('/')[path.split('/').length - 1];

        const tempDir = await fs.mkdtemp(
          nodePath.join(os.tmpdir(), 'graph-to-mermaid-'),
        );
        const tempPath = `${tempDir}/${fileName}.mmd`;

        await fs.writeFile(tempPath, mm);

        // ..................................
        // Convert dot file to target format
        const process = spawnSync('mmdc', [
          `-i${tempPath}`,
          `-o${path}`,
          `-s${scale}`,
        ]);
        assert(process.status === 0, `${process.stderr}`);

        // ..............
        // Write 2x image
        if (write2x && ['png', 'webp', 'jpg', 'jpeg'].includes(format)) {
          const path2x = path.replace(
            new RegExp(`\\.${format}$`),
            `_2x.${format}`,
          );

          const process = spawnSync('dot', [
            `-T${format}`,
            tempPath,
            `-o${path2x}`,
            `-s${scale}`,
          ]);
          assert(process.status === 0, `${process.stderr}`);
        }

        // Delete the temporary directory
        await fs.rm(tempDir, { recursive: true });
      }
    }
    /* v8 ignore stop */
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  // Nodes and clusters (subgraphs)
  private _mermaidNodes(scopeItem: GraphScopeItem, indent: number): string {
    let result = '';
    const scope = scopeItem.scope;
    const scopeId = `${scope.key}_${scope.id}`;

    // Create a subgraph for this scope
    result += ' '.repeat(indent) + `subgraph ${scopeId}["${scope.key}"]\n`;

    // Write each node
    for (const nodeItem of scopeItem.nodeItems) {
      const node = nodeItem.node;
      const nodeId = this._nodeId(node);
      const highlight = nodeItem.isHighlighted ? ':::highlight' : '';
      result +=
        ' '.repeat(indent + 2) + `${nodeId}["${node.key}"]${highlight}\n`;
    }

    // Write the child scopes
    for (const childScope of scopeItem.children) {
      result += this._mermaidNodes(childScope, indent + 2);
    }

    result += ' '.repeat(indent) + 'end\n';
    return result;
  }

  private readonly _baseIndent: string;

  // ...........................................................................
  private _mermaidEdges(scopeItem: GraphScopeItem): string {
    let result = '';

    // Write dependencies
    for (const nodeItem of scopeItem.nodeItems) {
      const node = nodeItem.node;

      for (const customer of nodeItem.shownCustomers) {
        const from = this._nodeId(node);
        const to = this._nodeId(customer.node);
        result += `${this._baseIndent}${from} --> ${to};\n`;
      }
    }

    // Write the child scopes
    for (const childScopeItem of scopeItem.children) {
      result += this._mermaidEdges(childScopeItem);
    }

    return result;
  }

  // ...........................................................................
  private get _style(): string {
    return '  classDef highlight fill:#FFFFAA,stroke:#333;';
  }

  // ...........................................................................
  private _nodeId(node: Node<any>): string {
    return `${node.key}_${node.id}`;
  }
}
