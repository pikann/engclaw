import { z } from 'zod'

const safeRelPath = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.startsWith('/') && !p.includes('\\') && !p.split('/').some((s) => s === '..' || s === ''),
    'path must be relative and stay inside the model folder',
  )

export const CatalogFile = z.object({
  path: safeRelPath,
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

export const CatalogModel = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  license: z.string().min(1),
  /** Hugging Face repo, e.g. `onnx-community/Kokoro-82M-v1.0-ONNX`. */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  /** Git SHA the files are pinned to; also the install folder name. */
  revision: z.string().regex(/^[\w.-]+$/),
  files: z.array(CatalogFile).min(1),
})

/** Shape of the `models.json` shipped with the app. */
export const Catalog = z.object({ models: z.array(CatalogModel) })

export type CatalogFile = z.infer<typeof CatalogFile>
export type CatalogModel = z.infer<typeof CatalogModel>
export type Catalog = z.infer<typeof Catalog>

export const totalSize = (m: CatalogModel): number => m.files.reduce((n, f) => n + f.size, 0)

export const fileUrl = (m: CatalogModel, f: CatalogFile): string =>
  `https://huggingface.co/${m.repo}/resolve/${m.revision}/${f.path.split('/').map(encodeURIComponent).join('/')}`
