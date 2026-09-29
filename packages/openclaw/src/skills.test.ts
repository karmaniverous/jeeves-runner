/**
 * Every shipped SKILL.md must carry name + description frontmatter.
 *
 * @module skills.test
 */

import { readdirSync, readFileSync } from 'node:fs';

import { validateSkillFrontmatter } from '@karmaniverous/jeeves';
import { describe, expect, it } from 'vitest';

const skillsDir = new URL('../skills/', import.meta.url);
const skills = readdirSync(skillsDir);

describe('shipped skills', () => {
  it('ships at least one skill', () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  it.each(skills)('%s has valid frontmatter', (skill) => {
    const content = readFileSync(
      new URL(`${skill}/SKILL.md`, skillsDir),
      'utf-8',
    );
    expect(() => validateSkillFrontmatter(content)).not.toThrow();
  });
});
