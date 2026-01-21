import React from 'react';

interface WikiAIChatProps {
    question: string;
    onQuestionChange: (value: string) => void;
    response: string;
    isLoading: boolean;
    onAsk: () => void;
    disabled?: boolean;
}

const WikiAIChat: React.FC<WikiAIChatProps> = ({ question, onQuestionChange, response, isLoading, onAsk, disabled }) => (
    <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-3">
            <input
                type="text"
                value={question}
                onChange={e => onQuestionChange(e.target.value)}
                placeholder="Задайте вопрос по строительству..."
                className="flex-1 bg-background border border-border rounded-md px-4 py-2 text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Вопрос к Wiki AI"
                disabled={disabled}
            />
            <button
                onClick={onAsk}
                disabled={disabled || isLoading}
                className="px-5 py-2 rounded-md font-semibold bg-primary text-white disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {isLoading ? 'Думаю...' : 'Спросить'}
            </button>
        </div>
        {response && (
            <div className="mt-4 text-sm text-text-primary bg-background border border-border rounded-md p-3 whitespace-pre-wrap">
                {response}
            </div>
        )}
    </div>
);

export default WikiAIChat;
