import { GYM, HOME } from './exercises';
import type {
  Exercise,
  Goal,
  Level,
  Muscle,
  Place,
  PlannedExercise,
  WorkoutDay,
  WorkoutPlan,
} from './types';
import { uid } from './storage';

/**
 * Gerador de treinos — princípios aplicados (consenso da literatura de
 * treinamento resistido, ex.: revisões sistemáticas sobre hipertrofia):
 * - 10 a 20 séries semanais efetivas por grupo muscular
 * - Cada musculatura trabalhada ~2x/semana
 * - Amplitude de movimento completa e progressão de carga ao longo das semanas
 * - Iniciantes: volume menor (2 séries), mais repetições controladas e foco em técnica
 * - Intervalos de descanso por nível (90-120s iniciante; 60-90s avançado)
 * - Finalizadores de cardio para objetivos de emagrecimento/condicionamento
 */

interface LevelCfg {
  sets: number;
  accessorySets: number;
  rest: number;
  restAccessory: number;
  repsCompound: string;
  repsAccessory: string;
  /** Níveis de exercício liberados */
  allowed: Level[];
  perMuscle: number;
}

const LEVEL_CFG: Record<Level, LevelCfg> = {
  iniciante: {
    sets: 2,
    accessorySets: 2,
    rest: 90,
    restAccessory: 60,
    repsCompound: '12–15',
    repsAccessory: '12–15',
    allowed: ['iniciante'],
    perMuscle: 2,
  },
  intermediario: {
    sets: 3,
    accessorySets: 3,
    rest: 75,
    restAccessory: 60,
    repsCompound: '8–12',
    repsAccessory: '10–15',
    allowed: ['iniciante', 'intermediario'],
    perMuscle: 3,
  },
  avancado: {
    sets: 4,
    accessorySets: 3,
    rest: 90,
    restAccessory: 60,
    repsCompound: '6–10',
    repsAccessory: '10–12',
    allowed: ['iniciante', 'intermediario', 'avancado'],
    perMuscle: 3,
  },
};

interface DayTemplate {
  day: WorkoutDay['day'];
  title: string;
  focus: string;
  muscles: Muscle[];
  /** exercícios compostos priorizados (selecionados em primeiro lugar) */
  compounds: string[];
  cardioFinisher?: boolean;
}

const GYM_SPLIT: DayTemplate[] = [
  {
    day: 'Seg',
    title: 'Peito + Tríceps',
    focus: 'Empurrar — membros superiores',
    muscles: ['peito', 'triceps', 'core'],
    compounds: ['g-sup-halteres', 'g-sup-reto', 'g-flexao'],
  },
  {
    day: 'Ter',
    title: 'Costas + Bíceps',
    focus: 'Puxar — membros superiores',
    muscles: ['costas', 'biceps'],
    compounds: ['g-puxada-frente', 'g-puxada-triangulo', 'g-remada-maquina'],
  },
  {
    day: 'Qua',
    title: 'Pernas completas',
    focus: 'Membros inferiores + glúteos',
    muscles: ['pernas'],
    compounds: ['g-leg-press', 'g-agachamento', 'g-afundo'],
  },
  {
    day: 'Qui',
    title: 'Ombros + Core',
    focus: 'Deltoides, estabilidade e postura',
    muscles: ['ombros', 'core'],
    compounds: ['g-desenvolvimento-maquina', 'g-desenvolvimento'],
  },
  {
    day: 'Sex',
    title: 'Full body + Cardio',
    focus: 'Corpo inteiro em compostos + finalização',
    muscles: ['peito', 'costas', 'pernas', 'core'],
    compounds: ['g-leg-press', 'g-puxada-frente', 'g-sup-halteres'],
    cardioFinisher: true,
  },
];

const HOME_SPLIT: DayTemplate[] = [
  {
    day: 'Seg',
    title: 'Peito + Core',
    focus: 'Empurrar em casa',
    muscles: ['peito', 'triceps', 'core'],
    compounds: ['h-flexao'],
  },
  {
    day: 'Ter',
    title: 'Costas + Ombros',
    focus: 'Puxar e elevar em casa',
    muscles: ['costas', 'ombros'],
    compounds: ['h-remada-mochila', 'h-pike-pushup'],
  },
  {
    day: 'Qua',
    title: 'Pernas em casa',
    focus: 'Membros inferiores com peso corporal',
    muscles: ['pernas'],
    compounds: ['h-agachamento', 'h-poliomenoro'],
  },
  {
    day: 'Qui',
    title: 'Full body leve',
    focus: 'Corpo inteiro, ritmo controlado',
    muscles: ['peito', 'costas', 'pernas', 'core'],
    compounds: ['h-flexao', 'h-remada-mochila', 'h-agachamento'],
  },
  {
    day: 'Sex',
    title: 'Cardio + Core',
    focus: 'Queima e estabilidade',
    muscles: ['cardio', 'core'],
    compounds: ['h-jumping-jack', 'h-polichinelo-alto'],
    cardioFinisher: true,
  },
];

const DAYS_BY_FREQ: Record<number, WorkoutDay['day'][]> = {
  3: ['Seg', 'Qua', 'Sex'],
  4: ['Seg', 'Ter', 'Qua', 'Sex'],
  5: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
};

/** RNG simples com seed para plano reproduzível (e variedade ao regenerar) */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickExercises(
  pool: Exercise[],
  muscle: Muscle,
  cfg: LevelCfg,
  compounds: string[],
  rand: () => number,
  limit: number
): Exercise[] {
  const allowed = pool.filter(
    (x) => x.muscle === muscle && cfg.allowed.includes(x.minLevel)
  );
  const priority = allowed.filter((x) => compounds.includes(x.id));
  const rest = allowed
    .filter((x) => !compounds.includes(x.id))
    .sort(() => rand() - 0.5);
  const chosen = [...priority, ...rest];
  return chosen.slice(0, Math.max(limit, Math.min(cfg.perMuscle, chosen.length)));
}

export function generatePlan(opts: {
  level: Level;
  place: Place;
  goal: Goal;
  daysPerWeek: number;
}): WorkoutPlan {
  const cfg = LEVEL_CFG[opts.level];
  const pool = opts.place === 'academia' ? GYM : HOME;
  const templates = opts.place === 'academia' ? GYM_SPLIT : HOME_SPLIT;
  const activeDays = DAYS_BY_FREQ[Math.min(5, Math.max(3, opts.daysPerWeek))];

  const seed = Date.now() % 2147483647;
  const rand = seededRandom(seed);

  const days: WorkoutDay[] = templates
    .filter((t) => activeDays.includes(t.day))
    .map((t) => {
      const exercises: PlannedExercise[] = [];
      for (const muscle of t.muscles) {
        if (muscle === 'cardio') continue;
        const isCore = muscle === 'core';
        const picked = pickExercises(pool, muscle, cfg, t.compounds, rand, isCore ? 1 : cfg.perMuscle);
        picked.forEach((ex, i) => {
          const compound = t.compounds.includes(ex.id) || i === 0;
          exercises.push({
            exerciseId: ex.id,
            name: ex.name,
            muscle: ex.muscle,
            equipment: ex.equipment,
            sets: isCore ? Math.max(2, cfg.sets - 1) : compound ? cfg.sets : cfg.accessorySets,
            reps: isCore ? '30–45s' : compound ? cfg.repsCompound : cfg.repsAccessory,
            restSec: compound ? cfg.rest : cfg.restAccessory,
            tip: ex.tip,
            done: false,
          });
        });
      }
      if (t.cardioFinisher || t.muscles.includes('cardio')) {
        const cardioPool = pool.filter((x) => x.muscle === 'cardio' && cfg.allowed.includes(x.minLevel));
        const cardio = cardioPool[Math.floor(rand() * cardioPool.length)];
        if (cardio) {
          exercises.push({
            exerciseId: cardio.id,
            name: cardio.name,
            muscle: 'cardio',
            equipment: cardio.equipment,
            sets: 1,
            reps: opts.level === 'avancado' && opts.goal !== 'hipertrofia' ? '15–20 min (intervalos)' : '20–30 min moderado',
            restSec: 0,
            tip: cardio.tip,
            done: false,
          });
        }
      }
      return { day: t.day, title: t.title, focus: t.focus, exercises };
    });

  const weekStart = new Date();
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day; // segunda da semana corrente
  weekStart.setDate(weekStart.getDate() + diff);

  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    weekLabel: weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    level: opts.level,
    place: opts.place,
    goal: opts.goal,
    days,
    rationale: rationaleFor(opts),
  };
}

function rationaleFor(opts: { level: Level; place: Place; goal: Goal }): string[] {
  const base = [
    'Frequência semanal: cada grupo muscular é treinado 2x na semana, dentro da faixa associada a melhores resultados em revisões sistemáticas.',
    'Volume progressivo: o número de séries sobe com o seu nível — iniciantes começam com 2 séries por exercício para dominar a técnica sem fadiga excessiva.',
    'Intervalos de descanso calibrados por nível para equilibrar desempenho e tempo de treino.',
    'Movimentos compostos (agachamento, supino, remada e variantes) vêm primeiro, quando a energia está maior.',
  ];
  if (opts.goal === 'emagrecer')
    base.push('Objetivo de emagrecimento: finalização cardiovascular moderada para aumentar o gasto sem comprometer a força.');
  if (opts.goal === 'hipertrofia')
    base.push('Objetivo de hipertrofia: faixas de 6–12 repetições com proximidade da falha, o padrão mais consistente na literatura para ganho de massa muscular.');
  if (opts.goal === 'condicionamento')
    base.push('Objetivo de condicionamento: circuitos e finalizações metabólicas para VO2 e resistência muscular.');
  if (opts.place === 'casa')
    base.push('Treino em casa: exercícios de peso corporal e cargas improvisadas (mochila, garrafas) — progressão feita por repetições, amplitude e cadência.');
  if (opts.level === 'iniciante')
    base.push('Como você é iniciante: o plano é deliberadamente mais tranquilo — cargas leves, foco total em aprender o movimento certo antes de aumentar intensidade.');
  return base;
}

/** Dia da semana atual mapeado para o plano (seg–sex); fim de semana retorna null */
export function todayPlanDay(): WorkoutDay['day'] | null {
  const map: Record<number, WorkoutDay['day'] | null> = {
    1: 'Seg',
    2: 'Ter',
    3: 'Qua',
    4: 'Qui',
    5: 'Sex',
    0: null,
    6: null,
  };
  return map[new Date().getDay()];
}

/** Próximo nível sugerido (gamificação) */
export function nextLevel(level: Level): Level | null {
  if (level === 'iniciante') return 'intermediario';
  if (level === 'intermediario') return 'avancado';
  return null;
}
