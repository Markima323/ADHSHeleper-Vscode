export type OffsetRange = { start: number; end: number };

export type SourceRangeDto = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

export type TokenSegment = {
  id: string;
  text: string;
  kind: "plain" | "word" | "blank";
  boldRanges: OffsetRange[];
};

export type ChoiceToken = { id: string; text: string };

export type BlankToken = {
  id: string;
  answerChoiceId: string;
  text: string;
  segmentIndex: number;
};

export type ClozeQuizModel = {
  seed: string;
  blanks: BlankToken[];
  choices: ChoiceToken[];
  maxBlankCount: number;
};

export type LearningChunk = {
  id: string;
  title: string;
  languageId: string;
  sourceUri: string;
  sourceRange: SourceRangeDto;
  code: string;
  tokenSegments: TokenSegment[];
  quiz: ClozeQuizModel;
  narrationText: string;
};

export type LearningSessionDto = {
  id: string;
  createdAt: string;
  chunks: LearningChunk[];
  settings: {
    boldRatio: number;
    ttsLocale: string;
    ttsRate: number;
  };
};
