// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assert } from './internal/assert.ts';
import { nodeSeparation, rankSeparation } from './graph.ts';
import type { GraphScopeItem } from './graph.ts';
import type { Node } from './node.ts';

/// Converts a graph to the DOT format.
export class GraphToDot {
  /**
   * Constructor
   * @param p - The parameters
   */
  constructor(p: { graph: GraphScopeItem; dpi?: number }) {
    this.graph = p.graph;
    this.dpi = p.dpi ?? GraphToDot.defaultDpi;
  }

  /// The graph to be converted
  readonly graph: GraphScopeItem;

  /// The dpi the graph is rendered
  readonly dpi: number;

  /// The default dpi used for exporting the graph
  static readonly defaultDpi: number = 72;

  /**
   * Set this flag to true, to enable testing svg and png export.
   * This is disabled by default because dot does generated different images
   * on different platforms.
   */
  static readonly testSvgAndPngExport = false;

  // ...........................................................................
  /// Turn a graph into dot format
  get dot(): string {
    let result = '';
    result += 'digraph unix {\n';
    result += `graph [ dpi = ${this.dpi} ]; \n`;
    result += `graph [nodesep = ${nodeSeparation}; ranksep=${rankSeparation}];\n`;
    result += 'fontname="Arial"\n';
    result += 'node [fontname="Arial"]\n';
    result += 'edge [fontname="Arial"]\n';
    result += this._dotNodes(this.graph);
    result += this._dotEdges(this.graph);
    result += '}\n';
    return this._indentDotGraph(result);
  }

  // ...........................................................................
  /**
   * Save the graph to a file
   *
   * The format can be
   * bmp canon cgimage cmap cmapx cmapx_np dot dot_json eps exr fig gd gd2 gif
   * gv icns ico imap imap_np ismap jp2 jpe jpeg jpg json json0 kitty kittyz
   * mp pct pdf pic pict plain plain-ext png pov ps ps2 psd sgi svg svgz tga
   * tif tiff tk vrml vt vt-24bit wbmp webp xdot xdot1.2 xdot1.4 xdot_json
   * @param p - The parameters
   */
  static async writeImageFile(p: {
    dot: string;
    path: string;
    dpi?: number;
    write2x?: boolean;
  }): Promise<void> {
    /* v8 ignore start -- node-only fs/subprocess IO exercised only with external graphviz tooling */
    const dot = p.dot;
    const path = p.path;
    const dpi = p.dpi ?? GraphToDot.defaultDpi;
    const write2x = p.write2x ?? false;

    const format = path.split('.')[path.split('.').length - 1];

    // Node-only modules are imported lazily so that the pure string
    // generation above does not depend on any node builtins.
    const fs = await import('node:fs/promises');

    if (format === 'dot') {
      await fs.writeFile(path, dot);
      return;
    } else {
      const env = (await import('node:process')).env;
      const { spawnSync } = await import('node:child_process');
      const os = await import('node:os');
      const nodePath = await import('node:path');

      if (!('GITHUB_ACTIONS' in env)) {
        // Write dot file to tmp
        const fileName = path.split('/')[path.split('/').length - 1];

        const tempDir = await fs.mkdtemp(
          nodePath.join(os.tmpdir(), 'graph-to-dot-'),
        );
        const tempPath = `${tempDir}/${fileName}.dot`;

        await fs.writeFile(tempPath, dot);

        // ..................................
        // Convert dot file to target format
        const process = spawnSync('dot', [
          `-T${format}`,
          tempPath,
          `-o${path}`,
          `-Gdpi=${dpi}`,
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
            `-Gdpi=${dpi * 2}`,
          ]);
          assert(process.status === 0, `${process.stderr}`);
        }

        // Delete the temporary directory
        await fs.rm(tempDir, { recursive: true });

        // Fix result and write it to the output file
        if (format === 'svg') {
          const svgContent = await fs.readFile(path, 'utf-8');
          const result = GraphToDot.fixSvgViewBox(svgContent);
          await fs.writeFile(path, result);
        }
      }
    }
    /* v8 ignore stop */
  }

  // ...........................................................................
  /**
   * Fixes the viewBox of an SVG file. By default it does cut the content.
   * @param content - The SVG content to fix
   */
  static fixSvgViewBox(content: string): string {
    // Regular expressions to find width and height
    const widthRegex = /width="(\d+\.?\d*)pt"/;
    const heightRegex = /height="(\d+\.?\d*)pt"/;

    // Find width and height matches
    const widthMatch = widthRegex.exec(content);
    const heightMatch = heightRegex.exec(content);

    if (widthMatch != null && heightMatch != null) {
      const width = widthMatch[1];
      const height = heightMatch[1];

      // Regular expression to replace the viewBox values
      const viewBoxRegex =
        /viewBox="\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*"/;
      const newViewBox = `viewBox="0.00 0.00 ${width} ${height}"`;

      // Replace the viewBox in the SVG content
      content = content.replace(viewBoxRegex, newViewBox);
    }

    return content;
  }

  // ######################
  // Private
  // ######################

  // ...........................................................................
  // Graph
  private _dotNodes(scopeItem: GraphScopeItem): string {
    let result = '';
    const scope = scopeItem.scope;

    const scopeId = `${scope.key}_${scope.id}`;

    // Create a cluster for this scope
    result += `subgraph cluster_${scopeId} {\n`;
    result += `label = "${scope.key}"; // scope\n`;
    if (scopeItem.isHighlighted) {
      result += 'style = filled;\n';
      result += 'fillcolor = "#AAFFFF88";\n';
    }

    // Write an empty node, if nodeItems is empty
    if (scopeItem.nodeItems.length === 0) {
      result += `invisible${this._invisibleCounter++} [label = "", shape = point, style=invis]; // ${scope.key}\n`;
    }

    // Write each node
    for (const nodeItem of scopeItem.nodeItems) {
      const node = nodeItem.node;
      const nodeId = this._nodeId(node);
      result += `${nodeId} [\n`;
      result += `  label = "${node.key}"; // node\n`;

      if (nodeItem.isHighlighted) {
        result += '  style = filled;\n';
        result += '  fillcolor = "#FFFFAA";\n';
      }

      result += '];\n';
    }

    // Write the child scopes
    for (const childScope of scopeItem.children) {
      result += this._dotNodes(childScope);
    }

    result += '\n}\n'; // cluster

    return result;
  }

  // ...........................................................................
  private _dotEdges(scopeItem: GraphScopeItem): string {
    let result = '';

    // Write dependencies
    for (const nodeItem of scopeItem.nodeItems) {
      const node = nodeItem.node;

      for (const customer of nodeItem.shownCustomers) {
        const from = this._nodeId(node);
        const to = this._nodeId(customer.node);
        result += `"${from}" -> "${to}";\n`;
      }
    }

    // Write the child scopes
    for (const childScopeItem of scopeItem.children) {
      result += this._dotEdges(childScopeItem);
    }

    return result;
  }

  // ...........................................................................
  private _invisibleCounter = 0;

  // ...........................................................................
  private _nodeId(node: Node<any>): string {
    return `${node.key}_${node.id}`;
  }

  // ...........................................................................
  private _indentDotGraph(graph: string): string {
    // Read the entire file content
    const content = graph;
    const lines = content.split('\n');
    let indent = 0;
    const indentedLines: string[] = [];
    const spaces = 2;

    for (const line of lines) {
      // Adjust indentation
      if (line.includes('}')) {
        indent -= spaces;
      }

      // Apply current indentation and add line to results
      const indentedLine = ' '.repeat(indent) + line;
      indentedLines.push(indentedLine);

      if (line.includes('{')) {
        indent += spaces;
      }
    }

    // Join all indented lines into a single string
    const indentedContent = indentedLines.join('\n');

    return indentedContent;
  }
}
