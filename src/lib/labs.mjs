// The eight labs on the hub, in the order they appear, grouped by subject.
// Names, colors, marks and home URLs come from learning-apps.mjs. Everything else here was checked against
// each lab's own pages (teachers page, activities, llms.txt) in November 2026: change it only after checking
// the lab again. Every URL is the lab's canonical form: Interactive Periodic Table uses no trailing slash,
// the other labs end every path in a slash.
import { learningApps } from './learning-apps.mjs';

const app = id => {
  const found = learningApps.find(entry => entry.id === id);
  if (!found) throw new Error(`learning-apps.mjs has no "${id}"`);
  return found;
};

/** @typedef {{ name: string, url: string }} Link */
/**
 * @typedef {{
 *   id: string, name: string, subject: string, url: string, color: string, tint: string, mark: string, path: string,
 *   group: string, does: string, grades: string | null, tools: Link[], teachersUrl: string | null, teachers: string | null,
 *   printables: boolean, classroomShare: boolean,
 * }} Lab
 */

const details = [
  {
    id: 'chemistry',
    group: 'Science',
    does: 'Explore all 118 elements, compare their properties, combine elements into real compounds and balance chemical equations.',
    grades: 'Middle and high school',
    tools: [
      ['Periodic table', '/'],
      ['3D atom viewer', '/atom-viewer'],
      ['Chemistry sandbox', '/sandbox'],
      ['Equation balancer', '/equation-balancer'],
      ['Identifying ions practical', '/identifying-ions'],
      ['Periodic table quiz', '/quiz'],
    ],
    teachersPath: '/teachers',
    teachers: 'Printable worksheets for the sandbox, balancing equations and identifying ions, each with an answer key, plus lesson ideas for the other tools.',
  },
  {
    id: 'physics',
    group: 'Science',
    does: 'Run simulations of motion, forces, energy, waves, circuits and light: launch a projectile, swing a pendulum, build a circuit and bend a ray of light.',
    grades: 'Grades 7–12',
    tools: [
      ['All physics experiments', '/experiments/'],
      ['Projectile motion', '/experiments/projectile-motion/'],
      ['Pendulum', '/experiments/pendulum/'],
      ['Ohm’s law circuit', '/experiments/ohms-law/'],
      ['Practice problems', '/practice/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'A printable activity and answer key for every experiment, NGSS connections and a worksheet builder.',
  },
  {
    id: 'biology',
    group: 'Science',
    does: 'Cross parents in a Punnett square, translate DNA into protein, take apart a 3D cell and model how a population grows.',
    grades: 'Grades 6–12',
    tools: [
      ['Punnett square calculator', '/punnett-square-calculator/'],
      ['DNA to protein', '/dna-transcription-translation/'],
      ['3D cell model', '/cells/3d/'],
      ['Label the cell', '/cells/label-the-cell/'],
      ['All biology tools', '/tools/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'Twelve printable classroom activities with answer keys and NGSS connections.',
  },
  {
    id: 'earth',
    group: 'Science',
    does: 'Locate an earthquake from seismograms, move tectonic plates, read a contour map, carve a river and follow water and rock through Earth’s cycles.',
    grades: 'Grades 5–10',
    tools: [
      ['Earthquake epicenter finder', '/tools/earthquake-epicenter/'],
      ['Plate tectonics explorer', '/tools/plate-tectonics/'],
      ['Contour map playground', '/tools/contour-map/'],
      ['Rock cycle builder', '/tools/rock-cycle/'],
      ['All earth science labs', '/tools/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'A one-page activity and answer key for each lab, how to run them in 10 to 15 minutes, and NGSS connections.',
  },
  {
    id: 'astronomy',
    group: 'Science',
    does: 'Set a planet’s orbit, step through the Moon’s phases and the seasons, line up an eclipse and find an exoplanet in a star’s light curve.',
    grades: 'Grades 6–12',
    tools: [
      ['Orbit simulator', '/labs/orbit-simulator/'],
      ['Moon phases', '/labs/moon-phases/'],
      ['Seasons simulator', '/labs/seasons/'],
      ['Eclipse simulator', '/labs/eclipses/'],
      ['All astronomy labs', '/labs/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'Printable worksheets with answer keys and NGSS connections for the simulations.',
  },
  {
    id: 'geometry',
    group: 'Math',
    does: 'Solve a triangle with worked steps, read the unit circle, transform shapes on a grid and print nets to fold into 3D shapes.',
    grades: 'Grades 6–12',
    tools: [
      ['Triangle solver', '/triangle-solver/'],
      ['Unit circle', '/unit-circle/'],
      ['Transformations', '/tools/transformations/'],
      ['Printable nets', '/printable-nets/'],
      ['All geometry tools', '/tools/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'Printable student activities with answer keys and Common Core connections.',
  },
  {
    id: 'kids',
    group: 'Coding',
    does: 'Guide a robot, snap code blocks together and write first real Python programs.',
    grades: null,
    tools: [],
    teachersPath: null,
    teachers: null,
  },
  {
    id: 'reading',
    group: 'Reading',
    does: 'Build a plot diagram, sort facts from opinions, tag the parts of speech and follow Aesop’s fables read aloud.',
    grades: 'Grades 2–8',
    tools: [
      ['Plot diagram builder', '/tools/plot-diagram/'],
      ['Fact or opinion', '/tools/fact-or-opinion/'],
      ['Parts of speech', '/tools/parts-of-speech/'],
      ['Fables read-along', '/tools/fables/'],
      ['All reading tools', '/tools/'],
    ],
    teachersPath: '/teachers/',
    teachers: 'One-page worksheets, teacher answer keys and short lesson plans for every tool.',
  },
];

/** @type {Lab[]} */
export const labs = details.map(({ id, tools, teachersPath, ...rest }) => {
  const { name, subject, url, color, tint, mark, path } = app(id);
  const href = /** @param {string} p */ p => (p === '/' ? `${url}/` : url + p);
  return {
    id, name, subject, url: `${url}/`, color, tint, mark, path, ...rest,
    tools: tools.map(([label, p]) => ({ name: label, url: href(p) })),
    teachersUrl: teachersPath ? href(teachersPath) : null,
    // Every lab with a teachers page has printable activities with answer keys and a Share to Google Classroom button.
    printables: Boolean(teachersPath),
    classroomShare: Boolean(teachersPath),
  };
});

export const groups = [
  { id: 'science', name: 'Science', blurb: 'Chemistry, physics, biology, earth science and astronomy.' },
  { id: 'math', name: 'Math', blurb: 'Geometry and trigonometry.' },
  { id: 'coding', name: 'Coding', blurb: 'First steps in programming for children.' },
  { id: 'reading', name: 'Reading', blurb: 'Reading and English skills.' },
].map(group => ({ ...group, labs: labs.filter(lab => lab.group === group.name) }));

/** Every lab URL the hub may link to. scripts/check-build.mjs fails on any other link to a lab domain. */
export const canonicalLabUrls = new Set(labs.flatMap(lab => [lab.url, ...lab.tools.map(tool => tool.url), ...(lab.teachersUrl ? [lab.teachersUrl] : [])]));
