import { useEffect, useState } from 'react';
import OrderEntry from './orderentry';
import OrderEntryMobile from './ordermobile';

const MOBILE_BREAKPOINT = 640;

// Watches viewport width so the screen flips on resize/rotate too, not just on load.
const useIsMobile = (breakpoint) => {
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
    );
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [breakpoint]);
    return isMobile;
};

// Picks the mobile-first order entry screen (ordermobile.js) on small viewports,
// the desktop grid/table one (orderentry.js) otherwise.
const OrderEntryResponsive = () => {
    const isMobile = useIsMobile(MOBILE_BREAKPOINT);
    return isMobile ? <OrderEntryMobile /> : <OrderEntry />;
};

export default OrderEntryResponsive;
