import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Navbar, Nav, Container } from 'react-bootstrap';
import { getExtensions } from '../services/api';

const navLinkStyle = ({ isActive }) => ({
  color: isActive ? '#fff' : '#ccc',
  fontWeight: isActive ? 'bold' : 'normal',
  borderBottom: isActive ? '2px solid var(--accent, #4e89ff)' : '2px solid transparent',
});

function Navigation() {
  const [expanded, setExpanded] = useState(false);
  const [extensions, setExtensions] = useState([]);

  useEffect(() => {
    getExtensions().then(setExtensions);
  }, []);

  return (
    <Navbar expand="lg" expanded={expanded} onToggle={setExpanded} sticky="top" style={{ background: '#0d1117', borderBottom: '1px solid var(--border)' }}>
      <Container fluid>
        <Navbar.Brand as={NavLink} to="/" onClick={() => setExpanded(false)} style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.3em' }}>
          <img src={`${process.env.PUBLIC_URL}/logo192.png`} alt="" style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8, verticalAlign: 'middle' }} />
          Budgett
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" style={{ borderColor: 'var(--border)' }} />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/" end onClick={() => setExpanded(false)} style={navLinkStyle}>Summary</Nav.Link>
            <Nav.Link as={NavLink} to="/transactions" onClick={() => setExpanded(false)} style={navLinkStyle}>Transactions</Nav.Link>
            <Nav.Link as={NavLink} to="/categories" onClick={() => setExpanded(false)} style={navLinkStyle}>Categories</Nav.Link>
            <Nav.Link as={NavLink} to="/income" onClick={() => setExpanded(false)} style={navLinkStyle}>Income</Nav.Link>
            <Nav.Link as={NavLink} to="/planning" onClick={() => setExpanded(false)} style={navLinkStyle}>Planning</Nav.Link>
            {extensions.length > 0 && (
              <Nav.Link as={NavLink} to="/extensions" onClick={() => setExpanded(false)} style={navLinkStyle}>Extensions</Nav.Link>
            )}
            <Nav.Link as={NavLink} to="/settings" onClick={() => setExpanded(false)} style={navLinkStyle}>Settings</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Navigation;
