/**
 * Reads a pack's bundled JSON Schema (draft 2020-12, one file with a `$defs` entry per upstream
 * schema file). Pure: runs in the browser and on the server. Knows nothing about DSDS field names:
 * it only follows `$ref`s.
 */
export type JsonSchema = { [key: string]: unknown };

/** A schema plus the resource (upstream schema file) it sits in, which relative `#/...` refs use. */
export interface Fragment {
  schema: JsonSchema;
  resource: JsonSchema;
}

/** Names of the `$ref`s followed to reach a fragment, e.g. `common/markdown`, `common/ref#/$defs/to`. */
export interface Dereferenced extends Fragment {
  refNames: string[];
}

const ANNOTATIONS = ['description', 'title', 'example', 'examples', 'default', '$comment'];

export class SchemaBundle {
  private readonly resources = new Map<string, JsonSchema>();
  readonly root: JsonSchema;

  constructor(bundled: JsonSchema) {
    this.root = bundled;
    const defs = (bundled.$defs ?? {}) as Record<string, JsonSchema>;
    for (const def of Object.values(defs)) {
      if (typeof def.$id === 'string') this.resources.set(def.$id, def);
    }
  }

  /** The schema of a whole document: the bundle's top-level `$ref` (a base document). */
  documentFragment(): Fragment {
    return this.deref({ schema: this.root, resource: this.root });
  }

  /** Follow `$ref`s until a concrete schema. Sibling annotations (description, example) win. */
  deref(frag: Fragment): Dereferenced {
    let { schema, resource } = frag;
    const refNames: string[] = [];
    const overrides: JsonSchema = {};
    for (let hops = 0; typeof schema.$ref === 'string' && hops < 32; hops++) {
      const ref = schema.$ref;
      for (const key of ANNOTATIONS) {
        if (key in schema && !(key in overrides)) overrides[key] = schema[key];
      }
      const target = this.lookup(ref, resource);
      if (!target) break;
      refNames.push(this.refName(ref, resource));
      schema = target.schema;
      resource = target.resource;
    }
    return { schema: { ...schema, ...overrides }, resource, refNames };
  }

  private lookup(ref: string, current: JsonSchema): Fragment | null {
    const hash = ref.indexOf('#');
    const base = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? '' : ref.slice(hash + 1);
    const resource = base === '' ? current : this.resources.get(base);
    if (!resource) return null;
    let node: unknown = resource;
    for (const seg of pointer.split('/').filter(Boolean)) {
      node = (node as JsonSchema | undefined)?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return node && typeof node === 'object' ? { schema: node as JsonSchema, resource } : null;
  }

  private refName(ref: string, current: JsonSchema): string {
    const hash = ref.indexOf('#');
    const base = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? '' : ref.slice(hash);
    const id = base === '' ? current.$id : base;
    const short =
      typeof id === 'string'
        ? (id.match(/\/v[\d.]+\/(.+?)\.schema\.(?:ya?ml|json)$/)?.[1] ?? id)
        : '';
    return `${short}${pointer}`;
  }
}
