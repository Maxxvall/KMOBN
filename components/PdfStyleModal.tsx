import React from 'react';

interface PdfStyleModalProps {
    onClose: () => void;
    onSelectStyle: (style: 'simple' | 'colored') => void;
}

const PdfStyleModal: React.FC<PdfStyleModalProps> = ({ onClose, onSelectStyle }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-surface rounded-lg shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-text-primary mb-4">Выберите стиль PDF</h2>
                <p className="text-text-secondary mb-6">Выберите, в каком стиле вы хотите скачать смету:</p>
                
                <div className="space-y-4">
                    <button
                        onClick={() => onSelectStyle('simple')}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-6 rounded-md shadow-md transition duration-300 text-left"
                    >
                        <div className="font-bold text-lg mb-1">Простой стиль</div>
                        <div className="text-sm text-gray-300">Классическая черно-белая смета с минимальным оформлением</div>
                    </button>
                    
                    <button
                        onClick={() => onSelectStyle('colored')}
                        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-md shadow-md transition duration-300 text-left"
                    >
                        <div className="font-bold text-lg mb-1">Цветной стиль</div>
                        <div className="text-sm text-green-100">Современная смета с фирменными цветами и логотипом</div>
                    </button>
                </div>
                
                <button
                    onClick={onClose}
                    className="w-full mt-6 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition duration-300"
                >
                    Отмена
                </button>
            </div>
        </div>
    );
};

export default PdfStyleModal;
