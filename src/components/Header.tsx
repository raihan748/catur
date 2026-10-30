import { Link } from 'react-router';

export default function Header() {
  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand">
        ♞ C.A.T.U.R
      </Link>
    </header>
  );
}
