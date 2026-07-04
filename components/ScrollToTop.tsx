import React, { useState, useEffect } from 'react';

const ScrollToTop: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            setIsVisible(scrollPercentage > 30);
        };

        window.addEventListener('scroll', toggleVisibility);
        return () => window.removeEventListener('scroll', toggleVisibility);
    }, []);

    return (
        <>
            {isVisible && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-8 right-8 bg-primary hover:bg-primary-hover text-white p-3 rounded-full shadow-lg transition-all duration-300 z-50 hover:scale-110"
                    aria-label="Наверх"
                >
                    ↑
                </button>
            )}
        </>
    );
};

export default React.memo(ScrollToTop);
