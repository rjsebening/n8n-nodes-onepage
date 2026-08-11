import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OnepageMcpOAuth2Api } from '../../credentials/OnepageMcpOAuth2Api.credentials';
import { ONEPAGE_MCP_DEFAULT_ENDPOINT } from '../../nodes/OnepageMcp/mcp/types';

const CREDENTIALS_DIR = join(__dirname, '../../credentials');

describe('credential modules', () => {
  /**
   * n8n loads credential classes in isolation, and a custom-extension install can place
   * `credentials/` without the sibling `nodes/` tree — a relative import across that boundary then
   * crashes n8n at startup with "Cannot find module". Credential files must stay self-contained.
   */
  it('never import across directories at runtime', () => {
    const sources = readdirSync(CREDENTIALS_DIR).filter((file) => file.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const source = readFileSync(join(CREDENTIALS_DIR, file), 'utf8');
      const valueImports = source
        .split('\n')
        .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line));

      for (const line of valueImports) {
        expect(line, `${file} must not import from outside credentials/`).not.toMatch(/'\.\.\//);
      }
    }
  });
});

describe('OnepageMcpOAuth2Api', () => {
  const credential = new OnepageMcpOAuth2Api();

  it('extends the generic OAuth2 credential', () => {
    expect(credential.name).toBe('onepageMcpOAuth2Api');
    expect(credential.extends).toEqual(['oAuth2Api']);
  });

  /**
   * Guards the inline "Connect" button. n8n's editor replaces the credential dropdown with it only
   * while no property of the merged `extends` chain is manually configurable. Turning any field
   * below into a visible one silently brings the dropdown back, which is easy to do by accident and
   * impossible to notice in a unit-less way.
   */
  it('keeps every property hidden so n8n offers the direct connect button', () => {
    expect(credential.properties.length).toBeGreaterThan(0);
    for (const property of credential.properties) {
      expect(property.type, `property "${property.name}" must stay hidden`).toBe('hidden');
    }
  });

  it('enables Dynamic Client Registration, which hides the inherited OAuth2 fields', () => {
    // With this false, oAuth2Api shows Grant Type / Auth URL / Client ID / Client Secret / Scope.
    const dcr = credential.properties.find((p) => p.name === 'useDynamicClientRegistration');
    expect(dcr?.default).toBe(true);
  });

  it('pins the server URL to the Onepage MCP endpoint', () => {
    const serverUrl = credential.properties.find((p) => p.name === 'serverUrl');
    expect(serverUrl?.default).toBe(ONEPAGE_MCP_DEFAULT_ENDPOINT);
  });

  it('lets the server advertise its own protected resource URL', () => {
    const resourceUrl = credential.properties.find((p) => p.name === 'resourceUrl');
    expect(resourceUrl).toBeDefined();
    expect(resourceUrl?.default).toBe('');
  });

  it('does not declare allowedHttpRequestDomains, so n8n stores the restrictive default', () => {
    // Declaring it would make n8n skip injecting `'none'`, letting the HTTP Request node use these
    // tokens.
    expect(credential.properties.map((p) => p.name)).not.toContain('allowedHttpRequestDomains');
  });
});
