
export const PROJECT_GITHUB_URL = 'https://github.com/vrma8/djikstra-NexaVoice';

export interface Builder {
  name: string;
  role: string;
  github?: string;
  linkedin?: string;
}

export const BUILDERS: Builder[] = [
  {
    name: 'Ravi K. Verma',
    role: 'Full-stack, voice AI & escalation',
    github: 'https://github.com/vrma8',
    linkedin: 'https://www.linkedin.com/in/ravi-k-verma/',
  },
  {
    name: 'Manoj Mohi Sajja',
    role: 'Design & shopping experience',
    github: 'https://github.com/SajjaManojMohi',
    linkedin: 'https://www.linkedin.com/in/manojmohisajja/',
  },
];

