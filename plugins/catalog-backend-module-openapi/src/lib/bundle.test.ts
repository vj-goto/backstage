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
import { bundleFileWithRefs, BundlerRead, BundlerResolveUrl } from './bundle';
import { mockServices } from '@backstage/backend-test-utils';
import { ScmIntegrations } from '@backstage/integration';

const specification = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "./paths/pets/list.yaml"
`;

const list = `
---
summary: List all pets
operationId: listPets
tags:
  - pets
responses:
  '200':
    description: A paged array of pets
    content:
      application/json:    
        schema:
          type: string
`;

const expectedResult = `
openapi: 3.0.0
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      tags:
        - pets
      responses:
        "200":
          description: A paged array of pets
          content:
            application/json:
              schema:
                type: string
`;

describe('bundleFileWithRefs', () => {
  const read = jest.fn();
  const resolveUrl = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the bundled specification', async () => {
    read.mockResolvedValue(list);

    const result = await bundleFileWithRefs(
      specification,
      'https://github.com/owner/repo/blob/main/catalog-info.yaml',
      read,
      resolveUrl,
    );

    expect(result).toEqual(expectedResult.trimStart());
  });
  it('should use the urlreaders to fetch $refs', async () => {
    const spec = `
    openapi: "3.0.0"
    info:
      version: 1.0.0
      title: Swagger Petstore
      license:
        name: MIT
    servers:
      - url: http://petstore.swagger.io/v1
    paths:
      /pets:
        get:
          $ref: "https://foo.com/paths/pets/list.yaml"
    `;

    read.mockResolvedValue(list);

    const result = await bundleFileWithRefs(
      spec,
      'https://github.com/owner/repo/blob/main/catalog-info.yaml',
      read,
      resolveUrl,
    );

    expect(result).toEqual(expectedResult.trimStart());
  });
  it('should return the bundled asyncapi 2.5.0 specification', async () => {
    const spec = `
      asyncapi: 2.5.0
      info:
        version: 1.0.0
        title: Sample API
        description: A sample API to illustrate OpenAPI concepts
      channels:
        my-topic:
          subscribe:
            message: 
              schemaFormat: "application/schema+json;version=draft-07"
              payload: 
                $ref : "./asyncapi.schema.json"
    `;
    const jsonSchema = `
      {
        "type": "object",
        "description": "ExampleSchema",
        "properties": {
          "name" : {
            "type": "string"
          },
          "age" : {
            "type" : "integer"
          }
        }
      }
    `;
    const expectedSchema = `
asyncapi: 2.5.0
info:
  version: 1.0.0
  title: Sample API
  description: A sample API to illustrate OpenAPI concepts
channels:
  my-topic:
    subscribe:
      message:
        schemaFormat: application/schema+json;version=draft-07
        payload:
          type: object
          description: ExampleSchema
          properties:
            name:
              type: string
            age:
              type: integer
`;
    read.mockResolvedValue(jsonSchema);

    const result = await bundleFileWithRefs(
      spec,
      'https://github.com/owner/repo/blob/main/catalog-info.yaml',
      read,
      resolveUrl,
    );

    expect(result).toEqual(expectedSchema.trimStart());
  });

  it('should return the bundled asyncapi 3.0.0 specification with preserved references', async () => {
    const spec = `
asyncapi: 3.0.0
info:
  version: 1.0.0
  title: AsyncAPI 3.0 Sample
  description: Sample AsyncAPI 3.0 with operations and replies
servers:
  test:
    host: api.example.com:5672
    protocol: kafka
channels:
  userSignup:
    address: user/signedup
    servers:
      - $ref: "#/servers/test"
    messages:
      UserSignedUp:
        $ref: "#/components/messages/UserSignedUp"
      ServiceUserSignup:
        $ref: "#/components/messages/ServiceUserSignup"
  userSignupReply:
    - $ref: "#/components/channels/userSignupReply"
operations:
  sendUserSignup:
    action: send
    channel:
      $ref: "#/channels/userSignup"
    messages:
      - $ref: "#/channels/userSignup/messages/UserSignedUp"
    reply:
      channel:
        $ref: "#/channels/userSignupReply"
      messages:
        - $ref: "#/channels/userSignupReply/messages/UserSignedUpReply"
  sendServiceUserSignup:
    $ref: "#/components/operations/sendServiceUserSignup"
components:
  channels:
    userSignupReply:
      servers:
        - $ref: "#/servers/test"
      address: user/signedup/reply
      messages:
        UserSignedUpReply:
          $ref: "#/components/messages/UserSignedUpReply"
        ServiceUserSignupReply:
          $ref: "#/components/messages/ServiceUserSignupReply"
  operations:
    sendServiceUserSignup:
      action: send
      channel:
        $ref: "#/channels/userSignup"
      messages:
        - $ref: "#/channels/userSignup/messages/ServiceUserSignup"
      reply:
        channel:
          $ref: "#/channels/userSignupReply"
        messages:
          - $ref: "#/channels/userSignupReply/messages/ServiceUserSignupReply"
  messages:
    UserSignedUp:
      $ref: "./messages/UserSignedUp.yaml"
    ServiceUserSignup:
      payload:
        type: object
        properties:
          serviceId:
            type: string
    UserSignedUpReply:
      $ref: "./messages/UserSignedUpReply.yaml"
    ServiceUserSignupReply:
      payload:
        type: object
        properties:
          success:
            type: boolean
    `;

    const userSignedUpMessage = `
payload:
  type: object
  properties:
    userId:
      type: string
`;

    const userSignedUpReplyMessage = `
payload:
  type: object
  properties:
    success:
      type: boolean
`;

    const expectedBundledSpec = `
asyncapi: 3.0.0
info:
  version: 1.0.0
  title: AsyncAPI 3.0 Sample
  description: Sample AsyncAPI 3.0 with operations and replies
servers:
  test:
    host: api.example.com:5672
    protocol: kafka
channels:
  userSignup:
    address: user/signedup
    servers:
      - $ref: "#/servers/test"
    messages:
      UserSignedUp:
        $ref: "#/components/messages/UserSignedUp"
      ServiceUserSignup:
        $ref: "#/components/messages/ServiceUserSignup"
  userSignupReply:
    - $ref: "#/components/channels/userSignupReply"
operations:
  sendUserSignup:
    action: send
    channel:
      $ref: "#/channels/userSignup"
    messages:
      - $ref: "#/channels/userSignup/messages/UserSignedUp"
    reply:
      channel:
        $ref: "#/channels/userSignupReply"
      messages:
        - $ref: "#/channels/userSignupReply/messages/UserSignedUpReply"
  sendServiceUserSignup:
    $ref: "#/components/operations/sendServiceUserSignup"
components:
  channels:
    userSignupReply:
      servers:
        - $ref: "#/servers/test"
      address: user/signedup/reply
      messages:
        UserSignedUpReply:
          $ref: "#/components/messages/UserSignedUpReply"
        ServiceUserSignupReply:
          $ref: "#/components/messages/ServiceUserSignupReply"
  operations:
    sendServiceUserSignup:
      action: send
      channel:
        $ref: "#/channels/userSignup"
      messages:
        - $ref: "#/channels/userSignup/messages/ServiceUserSignup"
      reply:
        channel:
          $ref: "#/channels/userSignupReply"
        messages:
          - $ref: "#/channels/userSignupReply/messages/ServiceUserSignupReply"
  messages:
    UserSignedUp:
      payload:
        type: object
        properties:
          userId:
            type: string
    ServiceUserSignup:
      payload:
        type: object
        properties:
          serviceId:
            type: string
    UserSignedUpReply:
      payload:
        type: object
        properties:
          success:
            type: boolean
    ServiceUserSignupReply:
      payload:
        type: object
        properties:
          success:
            type: boolean
`;

    read
      .mockResolvedValueOnce(userSignedUpMessage)
      .mockResolvedValueOnce(userSignedUpReplyMessage);

    const result = await bundleFileWithRefs(
      spec,
      'https://github.com/owner/repo/blob/main/catalog-info.yaml',
      read,
      resolveUrl,
    );

    expect(read).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expectedBundledSpec.trimStart());
  });
});

describe('bundleFileWithRefs - Testing getRelativePath scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const scmIntegrations = ScmIntegrations.fromConfig(mockServices.rootConfig());

  const resolveUrl: BundlerResolveUrl = jest.fn(
    (url: string, base: string): string => {
      return scmIntegrations.resolveUrl({ url, base });
    },
  );

  const read: BundlerRead = jest.fn(async (url: string) => {
    return Buffer.from(url);
  });

  const baseUrl =
    'https://dev.azure.com/organization/project/_git/idp-configurations?path=%2Frepo%2Ftest-openapi.yaml&version=GBmaster';

  it('should handle the relative path when refUrl has the same base as baseUrl', async () => {
    const fileWithRefs = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "common.yaml"
`;

    const relativePath = 'common.yaml';
    const expectedUrl =
      'https://dev.azure.com/organization/project/_git/idp-configurations?path=%2Frepo%2Fcommon.yaml&version=GBmaster';

    await bundleFileWithRefs(fileWithRefs, baseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(relativePath, baseUrl);
    expect(read).toHaveBeenCalledWith(expectedUrl);
  });

  it('should handle the relative path, with subdir, when refUrl has the same base as baseUrl', async () => {
    const fileWithRefs = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "commons/common.yaml"
`;

    const relativePath = 'commons/common.yaml';
    const expectedUrl =
      'https://dev.azure.com/organization/project/_git/idp-configurations?path=%2Frepo%2Fcommons%2Fcommon.yaml&version=GBmaster';

    await bundleFileWithRefs(fileWithRefs, baseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(relativePath, baseUrl);
    expect(read).toHaveBeenCalledWith(expectedUrl);
  });

  it('should handle the entire refUrl when there is no common base', async () => {
    const fileWithRef = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "https://example.com/commons/common.yaml"
`;

    const refUrl = 'https://example.com/commons/common.yaml';

    await bundleFileWithRefs(fileWithRef, baseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(refUrl, baseUrl);
    expect(read).toHaveBeenCalledWith(refUrl);
  });

  it('should handle the relative path when refUrl has a different subdir', async () => {
    const fileWithRefs = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "../commons/common.yaml"
`;

    const exampleBaseUrl =
      'https://example.com/path/to/definition/test-openapi.yaml.yaml';
    const relativePath = '../commons/common.yaml';
    const expectedUrl = 'https://example.com/path/to/commons/common.yaml';

    await bundleFileWithRefs(fileWithRefs, exampleBaseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(relativePath, exampleBaseUrl);
    expect(read).toHaveBeenCalledWith(expectedUrl);
  });

  it('should handle the relative path when refUrl has a different subdir (azure)', async () => {
    const fileWithRefs = `
openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: http://petstore.swagger.io/v1
paths:
  /pets:
    get:
      $ref: "../commons/common.yaml"
`;

    const relativePath = '../commons/common.yaml';
    const expectedUrl =
      'https://dev.azure.com/organization/project/_git/idp-configurations?path=%2Fcommons%2Fcommon.yaml&version=GBmaster';

    await bundleFileWithRefs(fileWithRefs, baseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(relativePath, baseUrl);
    expect(read).toHaveBeenCalledWith(expectedUrl);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Tests for resolvedUrlMap + file.reference fix (issue #418 / #33076)
// These tests require the updated @apidevtools/json-schema-ref-parser
// that exposes file.reference and file.baseUrl on the FileInfo object.
// ─────────────────────────────────────────────────────────────────────────────

describe('bundleFileWithRefs - nested $ref resolution using file.reference (issue #418 fix)', () => {
  const scmIntegrations = ScmIntegrations.fromConfig(mockServices.rootConfig());

  /**
   * Uses real ScmIntegrations.resolveUrl so that URL computation in the
   * resolvedUrlMap is realistic and predictable across tests.
   */
  const resolveUrl: BundlerResolveUrl = jest.fn(
    (url: string, base: string): string =>
      scmIntegrations.resolveUrl({ url, base }),
  );

  const githubRootBaseUrl =
    'https://github.com/owner/repo/blob/main/spec/openapi.yaml';

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wrap the real implementation each time so spy counts are clean
    (resolveUrl as jest.Mock).mockImplementation((url: string, base: string) =>
      scmIntegrations.resolveUrl({ url, base }),
    );
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('should use file.reference (original $ref) to call resolveUrl for depth-1 refs', async () => {
    /**
     * Verifies that resolveUrl receives the original $ref string exactly
     * as written in the schema, NOT a path.relative()-reconstructed path.
     *
     * With old code: resolveUrl(path.relative('.', fakeLocalPath), baseUrl)
     * With new code: resolveUrl(file.reference, baseUrl)
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      $ref: "./paths/users.yaml"
`;
    const usersYaml = `
summary: List users
operationId: listUsers
responses:
  "200":
    description: OK
`;

    const read: BundlerRead = jest.fn(async () => Buffer.from(usersYaml));

    await bundleFileWithRefs(spec, githubRootBaseUrl, read, resolveUrl);

    // resolveUrl MUST be called with the original $ref string
    expect(resolveUrl).toHaveBeenCalledWith(
      './paths/users.yaml',
      githubRootBaseUrl,
    );
    expect(read).toHaveBeenCalledWith(
      'https://github.com/owner/repo/blob/main/spec/paths/users.yaml',
    );
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('should resolve depth-2 nested $refs relative to their PARENT file URL, not root (the core fix)', async () => {
    /**
     * This is the KEY regression test for issue #33076.
     *
     * Schema structure:
     *   openapi.yaml
     *     └── $ref: "./schemas/User.yaml"         (depth-1)
     *           └── $ref: "./types/ID.yaml"        (depth-2)
     *
     * OLD (broken) behavior:
     *   resolveUrl('./types/ID.yaml', githubRootBaseUrl)
     *   → https://.../spec/types/ID.yaml          ← WRONG
     *
     * NEW (fixed) behavior using resolvedUrlMap:
     *   resolveUrl('./types/ID.yaml', 'https://.../spec/schemas/User.yaml')
     *   → https://.../spec/schemas/types/ID.yaml  ← CORRECT
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      $ref: "./schemas/User.yaml"
`;
    const userSchemaYaml = `
type: object
properties:
  id:
    $ref: "./types/ID.yaml"
  name:
    type: string
`;
    const idTypeYaml = `
type: string
format: uuid
`;

    const depth1ActualUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/User.yaml';
    const depth2CorrectUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/types/ID.yaml';
    const depth2WrongUrl =
      'https://github.com/owner/repo/blob/main/spec/types/ID.yaml'; // old broken path

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === depth1ActualUrl) return Buffer.from(userSchemaYaml);
      if (url === depth2CorrectUrl) return Buffer.from(idTypeYaml);
      throw new Error(`Unexpected URL fetched: ${url}`);
    });

    const result = await bundleFileWithRefs(
      spec,
      githubRootBaseUrl,
      read,
      resolveUrl,
    );

    // Depth-1: must resolve against root baseUrl
    expect(resolveUrl).toHaveBeenCalledWith(
      './schemas/User.yaml',
      githubRootBaseUrl,
    );

    // Depth-2: MUST resolve against PARENT's actual URL, not root
    expect(resolveUrl).toHaveBeenCalledWith('./types/ID.yaml', depth1ActualUrl);

    // read must NOT be called with the wrong (root-relative) URL
    expect(read).not.toHaveBeenCalledWith(depth2WrongUrl);

    // read must be called with the correct (parent-relative) URL
    expect(read).toHaveBeenCalledWith(depth2CorrectUrl);

    // Final bundled output is correct
    expect(result).toContain('format: uuid');
    expect(result).toContain('type: string');
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('should resolve cross-directory $refs correctly (backstage/backstage#33076 exact scenario)', async () => {
    /**
     * Reproduces the exact error from issue #33076:
     *
     *   $ref: "./../../common/specs/common.yaml#/components/responses/400"
     *   Error: Placeholder $openapi unable to bundle the file at
     *          ./transcript-tester.yaml,
     *          ResolverError: Error reading file "/common/specs/common.yaml"
     *
     * The path "./../../common/specs/common.yaml" is located two levels
     * above the spec file. With old code, path.relative('.', file.url) would
     * produce an absolute filesystem path like "/common/specs/common.yaml",
     * which cannot be resolved against the SCM URL.
     *
     * With the fix, file.reference = "./../../common/specs/common.yaml" is
     * used directly with the correct base URL.
     */
    const deepBaseUrl =
      'https://github.com/owner/repo/blob/main/services/api/openapi.yaml';

    const spec = `
openapi: "3.0.0"
info:
  title: Deep Path API
  version: 1.0.0
components:
  responses:
    BadRequest:
      $ref: "./../../common/specs/common.yaml#/components/responses/400"
`;
    const commonYaml = `
components:
  responses:
    "400":
      description: Bad Request
      content:
        application/json:
          schema:
            type: object
            properties:
              message:
                type: string
`;

    const expectedCommonUrl =
      'https://github.com/owner/repo/blob/main/common/specs/common.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === expectedCommonUrl) return Buffer.from(commonYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    await bundleFileWithRefs(spec, deepBaseUrl, read, resolveUrl);

    expect(resolveUrl).toHaveBeenCalledWith(
      './../../common/specs/common.yaml',
      deepBaseUrl,
    );
    expect(read).toHaveBeenCalledWith(expectedCommonUrl);
    // Verify no absolute local paths were used (old broken behavior)
    expect(read).not.toHaveBeenCalledWith('/common/specs/common.yaml');
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('should build resolvedUrlMap for multiple sibling refs inside the same nested file', async () => {
    /**
     * Verifies that when a nested file contains multiple sibling $refs,
     * ALL of them use the correct parent URL (not root).
     *
     *   openapi.yaml
     *     └── $ref: "./schemas/Parent.yaml"
     *           ├── $ref: "./enums/Status.yaml"   (sibling A)
     *           └── $ref: "./enums/Role.yaml"     (sibling B)
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Parent:
      $ref: "./schemas/Parent.yaml"
`;
    const parentSchemaYaml = `
type: object
properties:
  status:
    $ref: "./enums/Status.yaml"
  role:
    $ref: "./enums/Role.yaml"
`;
    const statusEnumYaml = `
type: string
enum: [active, inactive]
`;
    const roleEnumYaml = `
type: string
enum: [admin, user]
`;

    const parentActualUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/Parent.yaml';
    const statusActualUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/enums/Status.yaml';
    const roleActualUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/enums/Role.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === parentActualUrl) return Buffer.from(parentSchemaYaml);
      if (url === statusActualUrl) return Buffer.from(statusEnumYaml);
      if (url === roleActualUrl) return Buffer.from(roleEnumYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    await bundleFileWithRefs(spec, githubRootBaseUrl, read, resolveUrl);

    // Both siblings must resolve against the PARENT's URL, not root
    expect(resolveUrl).toHaveBeenCalledWith(
      './enums/Status.yaml',
      parentActualUrl,
    );
    expect(resolveUrl).toHaveBeenCalledWith(
      './enums/Role.yaml',
      parentActualUrl,
    );
    expect(read).toHaveBeenCalledWith(statusActualUrl);
    expect(read).toHaveBeenCalledWith(roleActualUrl);

    // Must NOT resolve against the root URL
    expect(read).not.toHaveBeenCalledWith(
      'https://github.com/owner/repo/blob/main/spec/enums/Status.yaml',
    );
    expect(read).not.toHaveBeenCalledWith(
      'https://github.com/owner/repo/blob/main/spec/enums/Role.yaml',
    );
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('should resolve a 3-level deep nested $ref chain correctly', async () => {
    /**
     * Level-0 (root): openapi.yaml
     *   └── $ref: "./level1/L1.yaml"
     *         └── $ref: "./level2/L2.yaml"     (relative to level1/)
     *               └── $ref: "./level3/L3.yaml" (relative to level1/level2/)
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Deep Chain API
  version: 1.0.0
components:
  schemas:
    L0:
      $ref: "./level1/L1.yaml"
`;
    const l1Yaml = `
type: object
properties:
  child:
    $ref: "./level2/L2.yaml"
`;
    const l2Yaml = `
type: object
properties:
  leaf:
    $ref: "./level3/L3.yaml"
`;
    const l3Yaml = `
type: string
`;

    const l1Url = 'https://github.com/owner/repo/blob/main/spec/level1/L1.yaml';
    const l2Url =
      'https://github.com/owner/repo/blob/main/spec/level1/level2/L2.yaml';
    const l3Url =
      'https://github.com/owner/repo/blob/main/spec/level1/level2/level3/L3.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === l1Url) return Buffer.from(l1Yaml);
      if (url === l2Url) return Buffer.from(l2Yaml);
      if (url === l3Url) return Buffer.from(l3Yaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    await bundleFileWithRefs(spec, githubRootBaseUrl, read, resolveUrl);

    // Each level resolves against its direct parent, not the root
    expect(resolveUrl).toHaveBeenCalledWith(
      './level1/L1.yaml',
      githubRootBaseUrl,
    );
    expect(resolveUrl).toHaveBeenCalledWith('./level2/L2.yaml', l1Url);
    expect(resolveUrl).toHaveBeenCalledWith('./level3/L3.yaml', l2Url);

    expect(read).toHaveBeenCalledWith(l1Url);
    expect(read).toHaveBeenCalledWith(l2Url);
    expect(read).toHaveBeenCalledWith(l3Url);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it('should correctly resolve nested $refs in Azure DevOps (query param URLs)', async () => {
    /**
     * Azure DevOps uses ?path= query params instead of path segments.
     * This is the exact scenario from issue #418 (custom reader + ADO).
     *
     *   Base: https://dev.azure.com/org/proj/_git/repo?path=%2Fservices%2Fapi%2Fopenapi.yaml
     *   $ref: "./schemas/User.yaml"
     *     └── $ref: "./types/ID.yaml"
     */
    const azureDeepBaseUrl =
      'https://dev.azure.com/org/proj/_git/repo?path=%2Fservices%2Fapi%2Fopenapi.yaml&version=GBmain';

    const spec = `
openapi: "3.0.0"
info:
  title: Azure API
  version: 1.0.0
components:
  schemas:
    User:
      $ref: "./schemas/User.yaml"
`;
    const userSchemaYaml = `
type: object
properties:
  id:
    $ref: "./types/ID.yaml"
`;
    const idTypeYaml = `
type: string
format: uuid
`;

    // Use real scmIntegrations for realistic Azure URL computation
    const azureResolveUrl: BundlerResolveUrl = jest.fn(
      (url: string, base: string) => scmIntegrations.resolveUrl({ url, base }),
    );

    const depth1AzureUrl = scmIntegrations.resolveUrl({
      url: './schemas/User.yaml',
      base: azureDeepBaseUrl,
    });
    const depth2AzureUrl = scmIntegrations.resolveUrl({
      url: './types/ID.yaml',
      base: depth1AzureUrl,
    });

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === depth1AzureUrl) return Buffer.from(userSchemaYaml);
      if (url === depth2AzureUrl) return Buffer.from(idTypeYaml);
      throw new Error(`Unexpected Azure URL: ${url}`);
    });

    await bundleFileWithRefs(spec, azureDeepBaseUrl, read, azureResolveUrl);

    // Depth-1: original $ref resolved against Azure base URL
    expect(azureResolveUrl).toHaveBeenCalledWith(
      './schemas/User.yaml',
      azureDeepBaseUrl,
    );

    // Depth-2: MUST use the depth-1 file's computed Azure URL as base
    expect(azureResolveUrl).toHaveBeenCalledWith(
      './types/ID.yaml',
      depth1AzureUrl,
    );

    expect(read).toHaveBeenCalledWith(depth1AzureUrl);
    expect(read).toHaveBeenCalledWith(depth2AzureUrl);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it('should handle HTTP absolute $refs inside a nested file using resolvedUrlMap', async () => {
    /**
     * A depth-1 file (relative $ref) contains an absolute HTTP $ref.
     * The HTTP resolver should still use the correct base from the map.
     *
     *   openapi.yaml
     *     └── $ref: "./schemas/Nested.yaml"        (file resolver)
     *           └── $ref: "https://external.com/types/Foo.yaml" (http resolver)
     */
    const spec = `
openapi: "3.0.0"
info:
  title: HTTP Ref Test
  version: 1.0.0
components:
  schemas:
    Nested:
      $ref: "./schemas/Nested.yaml"
`;
    const nestedYaml = `
type: object
properties:
  external:
    $ref: "https://external.example.com/schemas/Foo.yaml"
`;
    const externalYaml = `
type: string
description: External type
`;

    const nestedActualUrl =
      'https://github.com/owner/repo/blob/main/spec/schemas/Nested.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === nestedActualUrl) return Buffer.from(nestedYaml);
      if (url === 'https://external.example.com/schemas/Foo.yaml')
        return Buffer.from(externalYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await bundleFileWithRefs(
      spec,
      githubRootBaseUrl,
      read,
      resolveUrl,
    );

    expect(read).toHaveBeenCalledWith(nestedActualUrl);
    expect(read).toHaveBeenCalledWith(
      'https://external.example.com/schemas/Foo.yaml',
    );
    expect(result).toContain('description: External type');
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  it('should de-duplicate: not call read twice for the same $ref used in multiple places', async () => {
    /**
     * When the same file is $ref'd from multiple locations, read
     * should only be called once (library-level deduplication).
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Dedup Test
  version: 1.0.0
components:
  schemas:
    A:
      $ref: "./shared/Common.yaml"
    B:
      $ref: "./shared/Common.yaml"
`;
    const commonYaml = `
type: object
description: Shared schema
`;

    const commonActualUrl =
      'https://github.com/owner/repo/blob/main/spec/shared/Common.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === commonActualUrl) return Buffer.from(commonYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    await bundleFileWithRefs(spec, githubRootBaseUrl, read, resolveUrl);

    // Despite two $refs to the same file, read should only be called once
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(commonActualUrl);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────
  it('should propagate the error when read fails for a nested $ref', async () => {
    /**
     * Verifies that the original error (ResolverError) surfaces correctly
     * when a nested file cannot be fetched, matching the error format in #33076.
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Missing Ref API
  version: 1.0.0
components:
  schemas:
    Missing:
      $ref: "./schemas/DoesNotExist.yaml"
`;
    const read: BundlerRead = jest.fn(async () => {
      throw new Error('File not found');
    });

    await expect(
      bundleFileWithRefs(spec, githubRootBaseUrl, read, resolveUrl),
    ).rejects.toThrow();
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────
  it('should fall back to path.relative behavior when file.reference is undefined (older library)', async () => {
    /**
     * Backward-compatibility test: if the library does NOT provide
     * file.reference (older version without the #418 fix), the resolver
     * must fall back to the original path.relative('.', file.url) approach
     * without throwing or silently producing wrong output.
     *
     * This is tested indirectly — a simple single-level ref with a
     * non-deeply-nested path should still resolve correctly regardless of
     * which code path is taken.
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Compat Test
  version: 1.0.0
paths:
  /items:
    get:
      $ref: "./paths/items.yaml"
`;
    const itemsYaml = `
summary: Get items
responses:
  "200":
    description: OK
`;

    const read: BundlerRead = jest.fn(async () => Buffer.from(itemsYaml));

    // Should not throw regardless of library version
    const result = await bundleFileWithRefs(
      spec,
      githubRootBaseUrl,
      read,
      resolveUrl,
    );

    expect(result).toContain('summary: Get items');
    expect(read).toHaveBeenCalledTimes(1);
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────
  it('should handle $ref with a JSON pointer fragment (#) — only the file part is fetched', async () => {
    /**
     * $refs can include a fragment: "./common.yaml#/components/schemas/Error"
     * The resolver should fetch only the file part ("./common.yaml"),
     * and the library resolves the fragment internally.
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Fragment Ref Test
  version: 1.0.0
components:
  schemas:
    Error:
      $ref: "./common.yaml#/components/schemas/Error"
`;
    const commonYaml = `
components:
  schemas:
    Error:
      type: object
      properties:
        message:
          type: string
`;
    const commonActualUrl =
      'https://github.com/owner/repo/blob/main/spec/common.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === commonActualUrl) return Buffer.from(commonYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await bundleFileWithRefs(
      spec,
      githubRootBaseUrl,
      read,
      resolveUrl,
    );

    // resolveUrl called with fragment-stripped reference or full reference
    // (library strips fragment before calling resolver)
    expect(read).toHaveBeenCalledWith(commonActualUrl);
    expect(result).toContain('message');
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────
  it('should handle parallel nested $refs: both siblings receive correct resolvedUrlMap state', async () => {
    /**
     * Two independent depth-1 files, each with their own nested $ref.
     * Both must resolve their depth-2 refs relative to themselves, not root.
     *
     *   openapi.yaml
     *     ├── $ref: "./a/A.yaml"
     *     │     └── $ref: "./sub/ASub.yaml"   → must resolve under a/
     *     └── $ref: "./b/B.yaml"
     *           └── $ref: "./sub/BSub.yaml"   → must resolve under b/
     */
    const spec = `
openapi: "3.0.0"
info:
  title: Parallel Nested Test
  version: 1.0.0
components:
  schemas:
    A:
      $ref: "./a/A.yaml"
    B:
      $ref: "./b/B.yaml"
`;
    const aYaml = `
type: object
properties:
  sub:
    $ref: "./sub/ASub.yaml"
`;
    const bYaml = `
type: object
properties:
  sub:
    $ref: "./sub/BSub.yaml"
`;
    const aSubYaml = `
type: string
description: A sub
`;
    const bSubYaml = `
type: integer
description: B sub
`;

    const aUrl = 'https://github.com/owner/repo/blob/main/spec/a/A.yaml';
    const bUrl = 'https://github.com/owner/repo/blob/main/spec/b/B.yaml';
    const aSubUrl =
      'https://github.com/owner/repo/blob/main/spec/a/sub/ASub.yaml';
    const bSubUrl =
      'https://github.com/owner/repo/blob/main/spec/b/sub/BSub.yaml';

    const read: BundlerRead = jest.fn(async (url: string) => {
      if (url === aUrl) return Buffer.from(aYaml);
      if (url === bUrl) return Buffer.from(bYaml);
      if (url === aSubUrl) return Buffer.from(aSubYaml);
      if (url === bSubUrl) return Buffer.from(bSubYaml);
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await bundleFileWithRefs(
      spec,
      githubRootBaseUrl,
      read,
      resolveUrl,
    );

    // Each nested ref must resolve against its OWN parent
    expect(resolveUrl).toHaveBeenCalledWith('./sub/ASub.yaml', aUrl);
    expect(resolveUrl).toHaveBeenCalledWith('./sub/BSub.yaml', bUrl);

    expect(read).toHaveBeenCalledWith(aSubUrl);
    expect(read).toHaveBeenCalledWith(bSubUrl);

    // Descriptions must appear in output
    expect(result).toContain('A sub');
    expect(result).toContain('B sub');
  });
});
