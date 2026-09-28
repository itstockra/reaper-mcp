/**
 * Vitest unit tests for tools/render.ts
 *
 * Mock strategy: vi.mock('../bridge.js') — intercept sendCommand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../bridge.js', () => ({
  sendCommand: vi.fn(),
}));

import { sendCommand } from '../bridge.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRenderTools } from './render.js';

const sendCommandMock = sendCommand as unknown as ReturnType<typeof vi.fn>;

type ToolCallback = (params: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function getToolCallback(toolName: string): ToolCallback {
  const registeredTools: Record<string, ToolCallback> = {};
  const mockServer = {
    tool: (name: string, _description: string, _schema: unknown, callback: ToolCallback) => {
      registeredTools[name] = callback;
    },
  } as unknown as McpServer;

  registerRenderTools(mockServer);

  const cb = registeredTools[toolName];
  if (!cb) throw new Error(`Tool ${toolName} not registered`);
  return cb;
}

describe('render_tracks_to_files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rendered stem files on success', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: {
        outputDir: '/tmp/stems/',
        rendered: [
          { trackIndex: 0, trackName: 'Kick', filePath: '/tmp/stems/Kick.wav' },
          { trackIndex: 1, trackName: 'Bass', filePath: '/tmp/stems/Bass.wav' },
        ],
        failed: [],
        startTime: 0,
        endTime: 120,
        sampleRate: 48000,
      },
    });

    const cb = getToolCallback('render_tracks_to_files');
    const res = await cb({ outputDir: '/tmp/stems' });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.rendered).toHaveLength(2);
    expect(data.rendered[0].trackName).toBe('Kick');
    expect(data.failed).toHaveLength(0);
    expect(sendCommandMock).toHaveBeenCalledWith(
      'render_tracks_to_files',
      expect.objectContaining({ outputDir: '/tmp/stems' }),
      60_000
    );
  });

  it('passes trackIndices, time bounds, and sampleRate through', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: { outputDir: '/tmp/stems/', rendered: [], failed: [], startTime: 0, endTime: 10, sampleRate: 44100 },
    });

    const cb = getToolCallback('render_tracks_to_files');
    await cb({ outputDir: '/tmp/stems', trackIndices: [0, 2], startTime: 0, endTime: 10, sampleRate: 44100 });

    expect(sendCommandMock).toHaveBeenCalledWith(
      'render_tracks_to_files',
      expect.objectContaining({
        outputDir: '/tmp/stems',
        trackIndices: [0, 2],
        startTime: 0,
        endTime: 10,
        sampleRate: 44100,
      }),
      60_000
    );
  });

  it('returns isError when the bridge command fails', async () => {
    sendCommandMock.mockResolvedValue({ success: false, error: 'Missing required param: outputDir' });

    const cb = getToolCallback('render_tracks_to_files');
    const res = await cb({ outputDir: '' });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Missing required param: outputDir');
  });

  it('returns isError when every track fails to render', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: {
        outputDir: '/tmp/stems/',
        rendered: [],
        failed: [{ trackIndex: 5, error: 'Track not found' }],
        startTime: 0,
        endTime: 10,
        sampleRate: 44100,
      },
    });

    const cb = getToolCallback('render_tracks_to_files');
    const res = await cb({ outputDir: '/tmp/stems', trackIndices: [5] });

    expect(res.isError).toBe(true);
  });

  it('reports partial failure without isError when some tracks succeed', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: {
        outputDir: '/tmp/stems/',
        rendered: [{ trackIndex: 0, trackName: 'Kick', filePath: '/tmp/stems/Kick.wav' }],
        failed: [{ trackIndex: 5, error: 'Track not found' }],
        startTime: 0,
        endTime: 10,
        sampleRate: 44100,
      },
    });

    const cb = getToolCallback('render_tracks_to_files');
    const res = await cb({ outputDir: '/tmp/stems', trackIndices: [0, 5] });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.failed).toHaveLength(1);
  });
});

describe('render_master_to_file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the rendered master file path on success', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: {
        filePath: '/tmp/render/Master.wav',
        startTime: 0,
        endTime: 180,
        sampleRate: 48000,
        channelCount: 2,
      },
    });

    const cb = getToolCallback('render_master_to_file');
    const res = await cb({ outputDir: '/tmp/render' });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.filePath).toBe('/tmp/render/Master.wav');
    expect(sendCommandMock).toHaveBeenCalledWith(
      'render_master_to_file',
      expect.objectContaining({ outputDir: '/tmp/render' }),
      60_000
    );
  });

  it('passes a custom fileName through', async () => {
    sendCommandMock.mockResolvedValue({
      success: true,
      data: { filePath: '/tmp/render/Mix_v2.wav', startTime: 0, endTime: 10, sampleRate: 44100, channelCount: 2 },
    });

    const cb = getToolCallback('render_master_to_file');
    await cb({ outputDir: '/tmp/render', fileName: 'Mix_v2.wav' });

    expect(sendCommandMock).toHaveBeenCalledWith(
      'render_master_to_file',
      expect.objectContaining({ outputDir: '/tmp/render', fileName: 'Mix_v2.wav' }),
      60_000
    );
  });

  it('returns isError when the bridge command fails', async () => {
    sendCommandMock.mockResolvedValue({ success: false, error: 'Render produced no output file at: /tmp/render/Master.wav' });

    const cb = getToolCallback('render_master_to_file');
    const res = await cb({ outputDir: '/tmp/render' });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Render produced no output file');
  });
});
