DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

CREATE TABLE organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO organizations (name, slug) VALUES
  ('Acme Inc', 'acme'),
  ('Globex Corp', 'globex'),
  ('Initech', 'initech'),
  ('Hooli', 'hooli'),
  ('Pied Piper', 'pied-piper');

INSERT INTO users (org_id, name, email, role) VALUES
  (1, 'Alice', 'alice@acme.com', 'admin'),
  (1, 'Bob', 'bob@acme.com', 'member'),
  (1, 'Charlie', 'charlie@acme.com', 'member'),
  (2, 'Carol', 'carol@globex.com', 'admin'),
  (2, 'Dave', 'dave@globex.com', 'member'),
  (2, 'Eve', 'eve@globex.com', 'viewer'),
  (3, 'Frank', 'frank@initech.com', 'admin'),
  (3, 'Grace', 'grace@initech.com', 'member'),
  (4, 'Hank', 'hank@hooli.com', 'admin'),
  (4, 'Ivy', 'ivy@hooli.com', 'member'),
  (5, 'Jack', 'jack@piedpiper.com', 'admin'),
  (5, 'Kate', 'kate@piedpiper.com', 'member');

INSERT INTO posts (user_id, title, body, published) VALUES
  (1, 'Hello World', 'This is the first post.', true),
  (1, 'Getting Started with MySQL', 'A comprehensive guide.', true),
  (1, 'Advanced Queries', 'Deep dive into joins and subqueries.', true),
  (2, 'Draft Notes', 'Not published yet.', false),
  (2, 'My Journey', 'Learning databases from scratch.', true),
  (4, 'Company Announcement', 'We are growing!', true),
  (4, 'Tech Stack Update', 'Migrating to new infrastructure.', true),
  (5, 'Meeting Notes', 'Q3 planning session.', false),
  (7, 'Initech Blog', 'Office life and productivity.', true),
  (9, 'Hooli Research', 'New innovations in cloud computing.', true),
  (11, 'Pied Piper Launch', 'Our new product is live.', true),
  (11, 'Technical Architecture', 'How we built it.', true);

INSERT INTO comments (post_id, user_id, body) VALUES
  (1, 2, 'Great post! Welcome!'),
  (1, 3, 'Thanks for sharing Alice.'),
  (1, 4, 'Interesting perspective.'),
  (3, 2, 'This helped me understand joins better.'),
  (3, 5, 'Could you add an example with CTEs?'),
  (5, 1, 'Love reading about your journey!'),
  (6, 5, 'Congratulations on the growth!'),
  (7, 6, 'When is the migration planned?'),
  (11, 12, 'Excited about the launch!'),
  (11, 10, 'Great work team!'),
  (12, 12, 'Very detailed architecture doc.'),
  (12, 9, 'This is exactly what we needed.');
