import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import App from '@/App';

const EventSourcePage = lazy(() => import('@/pages/EventSourcePage'));
const FetchEventSourcePage = lazy(
  () => import('@/pages/FetchEventSourcePage'),
);

const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to='/event-source' replace /> },
      { path: 'event-source', element: <EventSourcePage /> },
      { path: 'fetch-event-source', element: <FetchEventSourcePage /> },
      { path: '*', element: <Navigate to='/event-source' replace /> },
    ],
  },
];

export default routes;
