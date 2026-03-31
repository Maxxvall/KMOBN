import React, { useState, useEffect } from 'react';

const ScrollToTop: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            const scrolled = window.scrollY;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const scrollPercentage = (scrolled / (documentHeight - windowHeight)) * 100;

            setIsVisible(scrollPercentage > 30);
        };

        window.addEventListener('scroll', toggleVisibility);
        return () => window.removeEventListener('scroll', toggleVisibility);
    }, []);

    const scrollToTop = () => {
        // Custom smooth scroll to avoid jumpy behavior in some browsers
        const start = window.scrollY || window.pageYOffset;
        const duration = 450; // ms
        let startTime: number | null = null;

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const animate = (time: number) => {
            if (startTime === null) startTime = time;
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            const y = Math.round(start * (1 - eased));
            window.scrollTo(0, y);
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    return (
        <>
            {isVisible && (
                <button
                    onClick={scrollToTop}
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
