import logging as log
import time
import math
from commands import *
from PTZcamera import *

log.basicConfig(format='%(asctime)s %(message)s')
log.addLevelName(5,"VERBOSE")
log.getLogger().setLevel("VERBOSE")

panSpeed = 0x04
tiltSpeed = 0x08

d1 = Camera("CAM1", "192.168.0.186", "")
d2 = Camera("CAM1", "192.168.0.187", "")
d3 = Camera("CAM1", "192.168.0.188", "")

#d.sendCommand(b"\x81\x01\x06\x01\x18\x14\x02\x02\xFF") # move down
 
d1.sendCommand(Commands.PowerOff)
#d2.sendCommand(Commands.PowerOff)
#d3.sendCommand(Commands.PowerOff)
#d.sendCommand(Commands.PanTiltLeft(panSpeed,tiltSpeed))
#d.sendCommand(Commands.ZoomWide)

#time.sleep(15)
#d.sendCommand(Commands.ZoomStop)

#d.sendCommand(Commands.PanTiltStop(panSpeed,tiltSpeed))

#d.sendCommand(Commands.MemoryRecall(3))

#d.sendCommand(Commands.PanTiltStop(panSpeed,tiltSpeed))
#d.sendCommand(Commands.PanTiltRight(panSpeed,tiltSpeed)) 
#time.sleep(25)
#d.sendCommand(Commands.PanTiltStop(panSpeed,tiltSpeed))

# while True:
# 	d.sendCommand(b"\x81\x01\x06\x01\x18\x14\x02\x02\xFF") # move down
# 	time.sleep(1)
# 	d.sendCommand(b"\x81\x01\x06\x01\x18\x14\x01\x01\xFF") # move up
# 	time.sleep(1)

#d.sendCommand(b"\x81\x01\x7e\x01\x18\x02\xff")
#c[0].setIP(name="LaurieC1")
#c[0].sendCommand(b"\x81\x01\x7e\x01\x5a\x02\xff") # lowest latency
#d.sendCommand(Commands.PanTiltUp())
#d.sendCommand(Commands.PanTiltAbs(0x3000,0,0x10,0x10))
#d1.getPos()
