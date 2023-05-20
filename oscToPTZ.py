### Just a quick lash-together for OSC -> PTZ commands so I can use my streamdeck :)

from pythonosc import dispatcher
from pythonosc import osc_server

from PTZcamera import *

c1 = Camera("CAM1", "192.168.0.186", "")
c2 = Camera("CAM2", "192.168.0.187", "")
c3 = Camera("CAM3", "192.168.0.188", "")

#c1 = c2 = c3 = ""

def cameraHandler(address, *args):
	panSpeed = 0x08
	tiltSpeed = 0x08
	data = address.split("/")
	
	if data[2] == "1":
	  c = c1
	elif data[2] == "2":
	  c = c2
	elif data[2] == "3":
	  c = c3
	else:
	  c = c1 # default to camera 1
	
	cmd = data[3]
	
	log.info(f'Camera {data[2]} Command {cmd} \tAddress {address}')
	
	if cmd=="up":
		c.sendCommand(Commands.PanTiltUp(panSpeed,tiltSpeed))
	elif cmd=="down":
		c.sendCommand(Commands.PanTiltDown(panSpeed,tiltSpeed))
	elif cmd == "left":
		c.sendCommand(Commands.PanTiltLeft(panSpeed,tiltSpeed))
	elif cmd == "right":
		c.sendCommand(Commands.PanTiltRight(panSpeed,tiltSpeed))
	elif cmd == "upleft":
		c.sendCommand(Commands.PanTiltUpLeft(panSpeed,tiltSpeed))
	elif cmd == "upright":
		c.sendCommand(Commands.PanTiltUpRight(panSpeed,tiltSpeed))
	elif cmd == "downleft":
		c.sendCommand(Commands.PanTiltDownLeft(panSpeed,tiltSpeed))
	elif cmd == "downright":
		c.sendCommand(Commands.PanTiltDownRight(panSpeed,tiltSpeed))
	elif cmd == "stop":
		c.sendCommand(Commands.PanTiltStop(panSpeed,tiltSpeed))
	elif cmd == "zoomin":
		c.sendCommand(Commands.ZoomTele)
	elif cmd == "zoomout":
		c.sendCommand(Commands.ZoomWide)
	elif cmd == "zoomstop":
		c.sendCommand(Commands.ZoomStop)
	elif cmd == "poweron":	
		c.sendCommand(Commands.PowerOn)
	elif cmd == "poweroff":	
		c.sendCommand(Commands.PowerOff)		
	elif cmd == "tallyon":	
		c.sendCommand(Commands.TallyOn)
	elif cmd == "tallyoff":	
		c.sendCommand(Commands.TallyOff)		
	elif cmd == "recall":
		try:
			mem = int(data[4])
			if mem < 8:
				c.sendCommand(Commands.MemoryRecall(mem))
		except:
			print("NYA")
			pass
	elif cmd == "store":
		try:
			mem = int(data[4])
			if mem < 8:
				c.sendCommand(Commands.MemorySet(mem))
		except:
			print("NYA")
			passx
	else:
	  log.error(f'Command not found {cmd}, full address {address}')


dispatcher = dispatcher.Dispatcher()
dispatcher.map("/camera/*", cameraHandler)

ip = "127.0.0.1"  # "192.168.0.105" # 
port = 54001

try:
    server = osc_server.ThreadingOSCUDPServer((ip, port), dispatcher)
    log.info("Serving on {}".format(server.server_address))
    server.serve_forever()
except:
	log.error(f'Could not connect at {ip} {port}'  )

#log.debug("Sending to %s: %r", ip, command)

