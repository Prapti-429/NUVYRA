import React from 'react';
import {CheckInResearchPage} from './CheckInResearchPage';

/**
 * Legacy compatibility export. The routed daily check-in is implemented in
 * CheckInResearchPage; keeping this export avoids maintaining two divergent
 * check-in implementations.
 */
export const CheckInMultimodalPage:React.FC=()=> <CheckInResearchPage/>;
