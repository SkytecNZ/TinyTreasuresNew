Insert child records to child table
INSERT INTO `child` (`id`, `first_name`, `last_name`, `gender`, `dob`, `picture`, `food_allergy`) VALUES ('1', 'Yewan', 'Jayamanne', 'Male', '2023-07-03', '', 'Dairy Foods');

Create log activity table
CREATE TABLE attendance_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  child_id INT,
  in_time TIME,
  out_time TIME,
  activities TEXT,
  date_logged DATE,
  FOREIGN KEY (child_id) REFERENCES child(id)
);