import React, { useEffect, useMemo, useState } from 'react';
import FocusLock from 'react-focus-lock';

interface ContractNameModalProps {
    onClose: () => void;
    onConfirm: (contractName: string) => void;
    defaultContractName: string;
}

const ContractNameModal: React.FC<ContractNameModalProps> = ({ onClose, onConfirm, defaultContractName }) => {
    const [value, setValue] = useState(defaultContractName || '');
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        setValue(defaultContractName || '');
        setTouched(false);
    }, [defaultContractName]);

    const trimmed = useMemo(() => value.trim(), [value]);
    const error = touched && !trimmed ? 'Введите заголовок документа.' : '';

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setTouched(true);
        if (!trimmed) return;
        onConfirm(trimmed);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            onKeyDown={handleKeyDown}
        >
            <FocusLock returnFocus>
                <div className="bg-surface rounded-lg shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold text-text-primary mb-2">Заголовок документа</h2>
                    <p className="text-text-secondary mb-4">Введите заголовок, который будет указан в первой строке PDF документа.</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="contractName" className="block text-sm font-semibold text-text-primary mb-2">Заголовок документа</label>
                            <input
                                id="contractName"
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    if (!touched) return;
                                    if (e.target.value.trim()) {
                                        setTouched(true);
                                    }
                                }}
                                onBlur={() => setTouched(true)}
                                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text-primary focus:ring-primary focus:border-primary"
                                placeholder="Приложение № 1 к договору КМ 2026-01"
                                autoFocus
                            />
                            {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition duration-300 disabled:bg-gray-600"
                                disabled={!trimmed}
                            >
                                Экспортировать
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full border border-border rounded-md py-2 font-semibold text-text-primary"
                            >
                                Отмена
                            </button>
                        </div>
                    </form>
                </div>
            </FocusLock>
        </div>
    );
};

export default React.memo(ContractNameModal);
