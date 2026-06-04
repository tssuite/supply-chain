// @license
// Copyright (c) 2025 tssuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Graph, GraphScopeItem } from './graph.ts';
import { GraphToMermaid, MarkdownFormat } from './graph-to-mermaid.ts';

/// Save the graph to a file
///
/// The format can be dot, mmd, md, svg, png, pdf
///
/// This is a Node-only helper. It lazily imports `node:fs/promises` so that
/// `graph.ts` itself stays browser-safe.
export async function writeImageFile(options: {
  graph: GraphScopeItem;
  path: string;
  scale?: number;
  markdownFormat?: MarkdownFormat;
  write2x?: boolean;
}): Promise<void> {
  const {
    graph,
    path,
    scale = 1.0,
    markdownFormat = MarkdownFormat.gitHub,
    write2x = false,
  } = options;

  const format = path.split('.').pop();

  // Write a dot file when form
  if (format === 'dot') {
    const fs = await import('node:fs/promises');
    await fs.writeFile(path, Graph.dot({ graph }));
    return;
  } else {
    await new GraphToMermaid({ graph }).writeImageFile({
      path: path,
      scale: scale,
      write2x: write2x,
      markdownFormat: markdownFormat,
    });
  }
}
