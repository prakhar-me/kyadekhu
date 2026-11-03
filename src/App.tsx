import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { CrashState, EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { SurpriseProvider } from './components/SurpriseMe';
import { AdvertisePage } from './pages/AdvertisePage';
import { HomePage } from './pages/HomePage';
import { MovieDetailsPage } from './pages/MovieDetailsPage';
import { SearchPage } from './pages/SearchPage';
import { WatchlistPage } from './pages/WatchlistPage';

const router = createBrowserRouter([
  {
    element: (
      <SurpriseProvider>
        <Layout />
      </SurpriseProvider>
    ),
    errorElement: <CrashState />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/movie/:id', element: <MovieDetailsPage /> },
      { path: '/watchlist', element: <WatchlistPage /> },
      { path: '/advertise', element: <AdvertisePage /> },
      { path: '*', element: <EmptyState title="This page doesn’t exist" /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
