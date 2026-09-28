/**
 * Rendering & bounce — headless render tools.
 *
 * Both tools trigger REAPER's render action with `auto-close render dialog`
 * (command 42230), so no render dialog ever appears and no human interaction
 * is required. Output files land directly on disk at the requested path.
 */

import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sendCommand } from '../bridge.js';
import type { RenderTracksToFilesResult, RenderMasterToFileResult } from '@reaper-mcp/protocol';

export function registerRenderTools(server: McpServer): void {
  server.tool(
    'render_tracks_to_files',
    'Render one or more tracks as individual stem WAV files — each track is soloed in turn and bounced (post-FX, post-fader) to outputDir/<TrackName>.wav. Headless: no render dialog appears. Defaults to all tracks and the full project length when trackIndices/startTime/endTime are omitted.',
    {
      outputDir: z.string().min(1)
        .describe('Absolute directory to write rendered files into (created if missing)'),
      trackIndices: z.array(z.coerce.number().int().min(0)).optional()
        .describe('Zero-based track indices to render (default: all tracks)'),
      startTime: z.coerce.number().min(0).optional()
        .describe('Start time in seconds from project start (default 0)'),
      endTime: z.coerce.number().min(0).optional()
        .describe('End time in seconds from project start (default: full project length)'),
      sampleRate: z.coerce.number().int().min(1).optional()
        .describe('Output sample rate (default: project sample rate, falls back to 44100)'),
    },
    async ({ outputDir, trackIndices, startTime, endTime, sampleRate }) => {
      const res = await sendCommand('render_tracks_to_files', {
        outputDir,
        trackIndices,
        startTime,
        endTime,
        sampleRate,
      }, 60_000);

      if (!res.success) {
        return { content: [{ type: 'text', text: `Error: ${res.error}` }], isError: true };
      }

      const data = res.data as RenderTracksToFilesResult;
      const isError = data.rendered.length === 0 && data.failed.length > 0;
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        ...(isError ? { isError: true } : {}),
      };
    }
  );

  server.tool(
    'render_master_to_file',
    'Render the full master mix (all tracks, ignoring any current solo state) to a single WAV file, e.g. outputDir/Master.wav. Headless: no render dialog appears. Defaults to the full project length when startTime/endTime are omitted.',
    {
      outputDir: z.string().min(1)
        .describe('Absolute directory to write the file into (created if missing)'),
      fileName: z.string().min(1).optional()
        .describe('Output file name (default: "Master.wav")'),
      startTime: z.coerce.number().min(0).optional()
        .describe('Start time in seconds from project start (default 0)'),
      endTime: z.coerce.number().min(0).optional()
        .describe('End time in seconds from project start (default: full project length)'),
      sampleRate: z.coerce.number().int().min(1).optional()
        .describe('Output sample rate (default: project sample rate, falls back to 44100)'),
    },
    async ({ outputDir, fileName, startTime, endTime, sampleRate }) => {
      const res = await sendCommand('render_master_to_file', {
        outputDir,
        fileName,
        startTime,
        endTime,
        sampleRate,
      }, 60_000);

      if (!res.success) {
        return { content: [{ type: 'text', text: `Error: ${res.error}` }], isError: true };
      }

      const data = res.data as RenderMasterToFileResult;
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
