/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  $RefParser,
  ParserOptions,
  ResolverOptions,
} from '@apidevtools/json-schema-ref-parser';
import { parse, stringify } from 'yaml';
import * as path from 'node:path';

const protocolPattern = /^(\w{2,}):\/\//i;
const getProtocol = (refPath: string) => {
  const match = protocolPattern.exec(refPath);
  if (match) {
    return match[1].toLowerCase();
  }
  return undefined;
};

export type BundlerRead = (url: string) => Promise<Buffer>;

export type BundlerResolveUrl = (url: string, base: string) => string;

// Preserved references paths for AsyncAPI v3 documents
const asyncApiV3PreservedPaths = [
  /#\/channels\/.*\/servers/,
  /#\/operations\/.*\/channel/,
  /#\/operations\/.*\/messages/,
  /#\/operations\/.*\/reply\/channel/,
  /#\/operations\/.*\/reply\/messages/,
  /#\/components\/channels\/.*\/servers/,
  /#\/components\/operations\/.*\/channel/,
  /#\/components\/operations\/.*\/messages/,
  /#\/components\/operations\/.*\/reply\/channel/,
  /#\/components\/operations\/.*\/reply\/messages/,
];

export async function bundleFileWithRefs(
  fileWithRefs: string,
  baseUrl: string,
  read: BundlerRead,
  resolveUrl: BundlerResolveUrl,
): Promise<string> {
  const resolvedUrlMap = new Map<string, string>();

  const fileUrlReaderResolver: ResolverOptions = {
    canRead: file => {
      const protocol = getProtocol(file.url);
      return protocol === undefined || protocol === 'file';
    },
    read: async file => {
      let actualUrl: string;
      if (file.reference !== undefined) {
        /**
         * NEW BEHAVIOR (requires json-schema-ref-parser fix from issue #418):
         * Use the original $ref string and resolve it against the parent's real SCM URL.
         *
         * file.reference  = original $ref, e.g. "./../../common/specs/common.yaml"
         * file.baseUrl    = parent document's fake internal URL
         *
         * Look up the parent's REAL SCM URL from our tracking map.
         * Fall back to the root baseUrl if the parent isn't in the map yet
         * (this correctly handles depth-1 refs from the root document).
         */
        const baseUrlKey = file.baseUrl?.split('#')[0];
        const parentActualUrl =
          (baseUrlKey ? resolvedUrlMap.get(baseUrlKey) : undefined) ?? baseUrl;
        actualUrl = resolveUrl(file.reference, parentActualUrl);
      } else {
        /**
         * FALLBACK: old behavior for backward compatibility with older
         * library versions that don't yet expose file.reference.
         */
        const relativePath = path.relative('.', file.url).replace(/\\/g, '/');
        actualUrl = resolveUrl(relativePath, baseUrl);
      }
      /**
       * Store the mapping: fake library URL → real SCM URL
       * This enables correct resolution of any nested $refs inside this file.
       */
      resolvedUrlMap.set(file.url, actualUrl);

      return await read(actualUrl);
    },
  };
  const httpUrlReaderResolver: ResolverOptions = {
    canRead: ref => {
      const protocol = getProtocol(ref.url);
      return protocol === 'http' || protocol === 'https';
    },
    read: async ref => {
      let actualUrl: string;
      if (ref.reference !== undefined && ref.baseUrl !== undefined) {
        /**
         * NEW BEHAVIOR: resolve original reference against parent's real URL.
         * Important for SCM providers (e.g. Azure DevOps) that use query params
         * instead of path segments — the parent's real URL must be the base.
         */
        const parentBaseKey = ref.baseUrl?.split('#')[0];
        const parentActualUrl =
          (parentBaseKey ? resolvedUrlMap.get(parentBaseKey) : undefined) ??
          baseUrl;
        actualUrl = resolveUrl(ref.reference, parentActualUrl);
      } else {
        // FALLBACK
        actualUrl = resolveUrl(ref.url, baseUrl);
      }

      resolvedUrlMap.set(ref.url, actualUrl);
      return await read(actualUrl);
    },
  };
  const options: ParserOptions = {
    resolve: {
      file: fileUrlReaderResolver,
      http: httpUrlReaderResolver,
    },
  };

  const fileObject = parse(fileWithRefs);

  if (fileObject.asyncapi) {
    const version = parseInt(fileObject.asyncapi, 10);

    if (version === 3) {
      options.bundle = {
        excludedPathMatcher: (refPath: string): any => {
          return asyncApiV3PreservedPaths.some(pattern =>
            pattern.test(refPath),
          );
        },
      };
    }
  }

  const bundledObject = await $RefParser.bundle(fileObject, options);
  return stringify(bundledObject);
}
